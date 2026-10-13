import { Injectable, BadRequestException, NotFoundException, Logger } from '@nestjs/common';
import { AiProxyService } from './ai-proxy.service';
import { ApplicationsService } from '../applications/applications.service';
import { Runtime } from '@aetherhost/domain';
import { getGithubToken } from '../applications/github-utils';


@Injectable()
export class AiProvisioningService {
  private readonly logger = new Logger(AiProvisioningService.name);

  constructor(
    private readonly aiProxy: AiProxyService,
    private readonly appsService: ApplicationsService,
  ) {}

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
The runtime field should be "docker".
${generateDesc ? '\nAlso generate a short engaging repository description based on the prompt in the "description" field.' : ''}

User Request: "${userPrompt}"

Respond ONLY with valid JSON in this exact format, with no markdown formatting or backticks. DO NOT output any reasoning blocks or <think> tags. Output the JSON object immediately:
{"name": "generated-name", "runtime": "docker", "dockerCompose": "version: '3'\\n...", "files": [{"path": "src/app.py", "content": "print('hello')"}]${generateDesc ? ', "description": "generated description"' : ''}}
    `.trim();

    const response = await this.aiProxy.complete(tenantId, prompt, 'infrastructure-provisioning');
    
    try {
      const parsed = this.extractJson(response.output);
      
      if (!parsed.name || !parsed.runtime || !parsed.dockerCompose) {
        throw new Error('Invalid JSON structure returned by LLM');
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
        aiUsage: response.usage,
      };
    } catch (err: any) {
      throw new BadRequestException('Failed to parse AI response into infrastructure: ' + err.message);
    }
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

    const filesOverview = currentFiles.length > 0
      ? currentFiles.map(f => `--- File: ${f.path} ---\n${f.content}\n--- End of ${f.path} ---`).join('\n\n')
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

    const response = await this.aiProxy.complete(tenantId, prompt, 'application-iteration', app.id);

    try {
      const parsed = this.extractJson(response.output);
      if (!parsed.files || !Array.isArray(parsed.files)) {
        throw new Error('LLM response must contain a "files" array');
      }

      const fileMap = new Map<string, string>();
      for (const f of currentFiles) {
        fileMap.set(f.path, f.content);
      }
      for (const f of parsed.files) {
        if (f.path && f.content !== undefined) {
          fileMap.set(f.path, f.content);
        }
      }

      const mergedFiles = Array.from(fileMap.entries()).map(([path, content]) => ({ path, content }));
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
        aiUsage: response.usage,
      };
    } catch (err: any) {
      throw new BadRequestException('Failed to process AI changes: ' + err.message);
    }
  }
}
