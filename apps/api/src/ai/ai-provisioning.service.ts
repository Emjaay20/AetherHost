import { Injectable, BadRequestException, NotFoundException, Logger } from '@nestjs/common';
import { AiProxyService } from './ai-proxy.service';
import { ApplicationsService } from '../applications/applications.service';
import { Runtime } from '@aetherhost/domain';
import { fetchGithubRepositoryFiles, getGithubToken } from '../applications/github-utils';
import { SYSTEM_TENANT_ID } from '../auth/tenant.decorator';
import { AI_FILE_RULES, normalizeFileContent, sanitizeAiFiles } from './ai-file-sanitizer';


@Injectable()
export class AiProvisioningService {
  private readonly logger = new Logger(AiProvisioningService.name);

  constructor(
    private readonly aiProxy: AiProxyService,
    private readonly appsService: ApplicationsService,
  ) {}

  private readonly autoFixAttempts = new Map<string, number[]>();

  /**
   * Called by the agent when an AI-generated app fails to build. Feeds the build
   * error back to the model once or twice so users rarely see a raw "failed".
   */
  async autoFixBuildFailure(applicationId: string, buildError: string) {
    const app = await this.appsService.findOne(applicationId, SYSTEM_TENANT_ID);
    const files = Array.isArray(app.aiFiles) ? app.aiFiles : [];
    if (files.length === 0) {
      return { fixed: false, reason: 'not_ai_generated' };
    }

    const windowMs = 6 * 60 * 60 * 1000;
    const recent = (this.autoFixAttempts.get(applicationId) ?? []).filter(
      (t) => Date.now() - t < windowMs,
    );
    if (recent.length >= 2) {
      return { fixed: false, reason: 'attempt_limit_reached' };
    }
    this.autoFixAttempts.set(applicationId, [...recent, Date.now()]);

    const trimmed = buildError.slice(-3500);
    try {
      await this.iterateOnApplication(
        app.tenantId,
        applicationId,
        `The last deployment failed to build. Fix the source files so the build and start succeed. ` +
          `Change only what is necessary.\nBuild/runtime error output:\n${trimmed}`,
      );
      return { fixed: true };
    } catch (err: any) {
      this.logger.warn(`Auto-fix failed for ${applicationId}: ${err?.message ?? err}`);
      return { fixed: false, reason: 'ai_error' };
    }
  }

  /**
   * User-initiated repair. Unlike a diagnosis, this writes the AI's minimal
   * source correction and queues a fresh deployment.
   */
  async fixDeploymentFailure(
    tenantId: string,
    applicationId: string,
    buildError = '',
  ) {
    const app = await this.appsService.findOne(applicationId, tenantId);
    const storedFiles = Array.isArray(app.aiFiles) ? app.aiFiles : [];
    if (storedFiles.length === 0 && !app.githubRepo) {
      throw new BadRequestException(
        'This project has no editable source snapshot. Connect its GitHub repository or deploy it through AetherHost before asking AI to repair it.',
      );
    }

    const logs = buildError.trim() || (await this.appsService.getRecentLogText(applicationId, tenantId));
    return this.iterateOnApplication(
      tenantId,
      applicationId,
      `The latest deployment failed. Repair the root cause, changing only the files needed, then make sure the application can build, start, and pass its health check. ${
        logs ? `\n\nDeployment error output:\n${logs.slice(-8_000)}` : ''
      }`,
    );
  }

  private extractJson(rawOutput: string): any {
    let cleaned = rawOutput
      .replace(/<think>[\s\S]*?<\/think>/gi, '')
      .replace(/```json/gi, '')
      .replace(/```/g, '')
      .trim();

    const firstBrace = cleaned.indexOf('{');
    const lastBrace = cleaned.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      cleaned = cleaned.slice(firstBrace, lastBrace + 1);
    }

    try {
      return JSON.parse(cleaned);
    } catch {
      // Repair literal control characters inside JSON string values if present
      let inString = false;
      let escaped = false;
      let repaired = '';
      for (let i = 0; i < cleaned.length; i++) {
        const ch = cleaned[i];
        if (inString) {
          if (escaped) {
            repaired += ch;
            escaped = false;
          } else if (ch === '\\') {
            repaired += ch;
            escaped = true;
          } else if (ch === '"') {
            repaired += ch;
            inString = false;
          } else if (ch === '\n') {
            repaired += '\\n';
          } else if (ch === '\r') {
            repaired += '\\r';
          } else if (ch === '\t') {
            repaired += '\\t';
          } else {
            repaired += ch;
          }
        } else {
          if (ch === '"') {
            inString = true;
          }
          repaired += ch;
        }
      }
      return JSON.parse(repaired);
    }
  }

  async provisionFromPrompt(tenantId: string, userPrompt: string, repoName?: string, repoDesc?: string, generateDesc?: boolean) {
    const prompt = `
You are an AI infrastructure architect for a modern PaaS called AetherHost.
The user wants to deploy a new application.
Determine a good name for it (lowercase, hyphenated, no spaces).
Generate a fully working docker-compose.yml file string that satisfies their request.
Use standard images. The compose file should NOT define any networks.
Do not expose any ports to the host (no 'ports: - "80:80"'), instead just use 'expose: - "80"'.
VERY IMPORTANT: You MUST add Traefik labels to the main application container so it routes correctly. Add these exact labels under the main service (replace APP_NAME with the generated name):
labels:
  - "traefik.enable=true"
  - "traefik.docker.network=aetherhost-net"
  - "traefik.http.routers.APP_NAME.rule=Host(\`APP_NAME.localhost\`)"
  - "traefik.http.services.APP_NAME.loadbalancer.server.port=80" (adjust port to match what the app listens on, e.g. 8080 or 8000)
Crucially, generate the actual minimal application code files needed (e.g. src/main.rs, app.py, requirements.txt, Cargo.toml, index.html) and put them in the 'files' array. Include a clean HTML UI or index.html so the live preview looks great. Keep code concise to avoid cutting off the JSON.
    ${AI_FILE_RULES}
    The runtime field should be "docker".
${generateDesc ? '\nAlso generate a short engaging repository description based on the prompt in the "description" field.' : ''}

User Request: "${userPrompt}"

Respond ONLY with valid JSON in this exact format, with no markdown formatting or backticks. DO NOT output any reasoning blocks or <think> tags. Output the JSON object immediately:
{"name": "generated-name", "runtime": "docker", "dockerCompose": "version: '3'\\n...", "files": [{"path": "src/app.py", "content": "print('hello')"}]${generateDesc ? ', "description": "generated description"' : ''}}
    `.trim();

    let parsed: any;
    let usage: any;
    try {
      const generated = await this.generateChecked(tenantId, 'infrastructure-provisioning', prompt, undefined, (candidate) => {
        if (!candidate.name || !candidate.runtime || !candidate.dockerCompose) {
          throw new Error('Invalid JSON structure returned by LLM');
        }
        candidate.dockerCompose = normalizeFileContent(String(candidate.dockerCompose));
        candidate.files = sanitizeAiFiles(Array.isArray(candidate.files) ? candidate.files : []);
      });
      parsed = generated.parsed;
      usage = generated.usage;
    } catch (err: any) {
      throw new BadRequestException('Failed to parse AI response into infrastructure: ' + err.message);
    }

    const finalRepoName = repoName || parsed.name;
    const finalRepoDesc = repoDesc || parsed.description || '';
    const githubRepoUrl = undefined;

    const app = await this.appsService.create(
      tenantId,
      parsed.name,
      parsed.runtime as Runtime,
      githubRepoUrl,
      parsed.dockerCompose,
      parsed.files,
      finalRepoName,
      finalRepoDesc,
    );

    return {
      success: true,
      application: app,
      aiUsage: usage,
    };
  }

  async iterateOnApplication(
    tenantId: string,
    applicationId: string,
    userPrompt: string,
  ) {
    const app = await this.appsService.findOne(applicationId, tenantId);
    if (!app) {
      throw new NotFoundException('Application not found');
    }

    let currentFiles: { path: string; content: string }[] = [];
    if (app.aiFiles && Array.isArray(app.aiFiles)) {
      currentFiles = app.aiFiles as unknown as { path: string; content: string }[];
    }

    // Connected repositories are editable from the platform as well. Read a
    // deliberately bounded text-only snapshot using the owner's OAuth token;
    // the token and source never leave the server except for the AI request.
    if (currentFiles.length === 0 && app.githubRepo) {
      const token = await getGithubToken(tenantId);
      if (!token) {
        throw new BadRequestException(
          'Reconnect GitHub before editing this project with AI.',
        );
      }
      currentFiles = await fetchGithubRepositoryFiles(app.githubRepo, token);
      if (currentFiles.length === 0) {
        throw new BadRequestException(
          'AetherHost could not read editable text files from this GitHub repository. Check the repository connection and try again.',
        );
      }
    }

    const previewFiles = currentFiles.map((file) => ({
      path: file.path,
      content: normalizeFileContent(file.content),
    }));
    const filesOverview = previewFiles.length > 0
      ? previewFiles.map(f => `--- File: ${f.path} ---\n${f.content}\n--- End of ${f.path} ---`).join('\n\n')
      : `No current source files stored. Create standard minimal files for runtime: ${app.runtime}`;

    const prompt = `
You are an expert fullstack AI software engineer and architect for AetherHost.
You are modifying and improving an existing application.

Application Name: ${app.name}
Runtime: ${app.runtime}
GitHub Repository: ${app.githubRepo || 'None'}

Current Project Files:
${filesOverview}

User Change Request:
"${userPrompt}"

Instructions:
1. Carefully update, improve, or add files to satisfy the user's request.
    2. Return complete, working file contents for every modified or new file. Keep code concise and well-structured so the JSON output is never truncated.
    ${AI_FILE_RULES}
    3. Ensure the root "/" route or an "index.html" file renders a clean, interactive HTML UI reflecting the new features so the Live Preview updates visibly, and ensure "/health" returns HTTP 200.
4. Generate a concise, conventional git commit message (e.g. "feat: add /api/users endpoint").
5. Provide a brief 1-2 sentence human summary of changes.

Respond ONLY with valid JSON in this exact structure, with no markdown code blocks or backticks. DO NOT output reasoning or <think> tags. Output the JSON object immediately:
{
  "summary": "1-2 sentence summary of what was added or changed",
  "commitMessage": "feat: concise conventional commit message",
  "files": [
    { "path": "path/to/file.ext", "content": "full content" }
  ]
}
`.trim();

    let parsed: any;
    let usage: any;
    let mergedFiles: { path: string; content: string }[] = [];
    try {
      const generated = await this.generateChecked(tenantId, 'application-iteration', prompt, app.id, (candidate) => {
        if (!candidate.files || !Array.isArray(candidate.files)) {
          throw new Error('LLM response must contain a "files" array');
        }
        const fileMap = new Map<string, string>();
        for (const f of currentFiles) {
          fileMap.set(f.path, f.content);
        }
        for (const f of candidate.files) {
          if (f.path && f.content !== undefined) {
            fileMap.set(f.path, f.content);
          }
        }
        mergedFiles = sanitizeAiFiles(Array.from(fileMap.entries()).map(([path, content]) => ({ path, content })));
      });
      parsed = generated.parsed;
      usage = generated.usage;
    } catch (err: any) {
      throw new BadRequestException('Failed to process AI changes: ' + err.message);
    }

    try {
      const commitMsg = parsed.commitMessage || `AI Architect: ${userPrompt.slice(0, 50)}`;

      let finalGithubRepo = app.githubRepo;
      if (!finalGithubRepo && app.runtime !== 'wordpress') {
        const token = await getGithubToken(tenantId);
        if (token) {
          try {
            const ghRes = await fetch('https://api.github.com/user/repos', {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/vnd.github.v3+json',
                'Content-Type': 'application/json',
                'User-Agent': 'AetherHost-API',
              },
              body: JSON.stringify({
                name: app.githubRepoName || app.name,
                description: app.githubRepoDescription || `AetherHost deployed ${app.runtime} app`,
                private: true,
                auto_init: false,
              }),
            });
            if (ghRes.ok) {
              const repoData = await ghRes.json();
              finalGithubRepo = repoData.clone_url;
            } else if (ghRes.status === 422) {
              const userRes = await fetch('https://api.github.com/user', {
                headers: {
                  'Authorization': `Bearer ${token}`,
                  'User-Agent': 'AetherHost-API',
                },
              });
              if (userRes.ok) {
                const userData = await userRes.json();
                const targetName = app.githubRepoName || app.name;
                const existingRepoRes = await fetch(`https://api.github.com/repos/${userData.login}/${targetName}`, {
                  headers: {
                    'Authorization': `Bearer ${token}`,
                    'User-Agent': 'AetherHost-API',
                  },
                });
                if (existingRepoRes.ok) {
                  const existingData = await existingRepoRes.json();
                  finalGithubRepo = existingData.clone_url;
                }
              }
            } else {
              const errBody = await ghRes.text();
              this.logger.warn(`GitHub API repo creation returned ${ghRes.status}: ${errBody}`);
            }
          } catch (e) {
            this.logger.error(
              `Failed to create repo during iteration: ${e instanceof Error ? e.message : String(e)}`,
            );
          }
        }
      }

      await this.appsService.applyAiIteration(app.id, tenantId, {
        aiFiles: mergedFiles,
        commitMessage: commitMsg,
        githubRepo: finalGithubRepo || undefined,
      });

      return {
        success: true,
        summary: parsed.summary || 'Application updated successfully',
        commitMessage: commitMsg,
        files: mergedFiles,
        githubRepo: finalGithubRepo,
        aiUsage: usage,
      };
    } catch (err: any) {
      throw new BadRequestException('Failed to process AI changes: ' + err.message);
    }
  }

  private async generateChecked(
    tenantId: string,
    purpose: string,
    basePrompt: string,
    applicationId: string | undefined,
    accept: (parsed: any) => void,
  ) {
    let rejection = '';
    let usage: any;
    let parsed: any;
    for (let attempt = 0; attempt < 2; attempt++) {
      const prompt = rejection
        ? `${basePrompt}\n\nYour previous output was rejected and was NOT deployed:\n${rejection}\nReturn corrected JSON only. File contents must be raw source, not escaped text.`
        : basePrompt;
      const response = await this.aiProxy.complete(tenantId, prompt, purpose, applicationId);
      usage = response.usage;
      try {
        parsed = this.extractJson(response.output);
        accept(parsed);
        return { parsed, usage };
      } catch (err) {
        rejection = err instanceof Error ? err.message : String(err);
      }
    }
    throw new Error(rejection || 'AI response was not valid JSON');
  }
}
