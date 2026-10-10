import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { AiProxyService } from './ai-proxy.service';
import { ApplicationsService } from '../applications/applications.service';
import { Runtime } from '@aetherhost/domain';
import { getGithubToken } from '../applications/github-utils';


@Injectable()
export class AiProvisioningService {
  constructor(
    private readonly aiProxy: AiProxyService,
    private readonly appsService: ApplicationsService,
  ) {}

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
  - "traefik.enable=true"\n  - "traefik.docker.network=aetherhost-net"
  - "traefik.http.routers.APP_NAME.rule=Host(\`APP_NAME.localhost\`)"
  - "traefik.http.services.APP_NAME.loadbalancer.server.port=80" (adjust port to match what the app listens on, e.g. 8080 or 8000)
Crucially, generate the actual minimal application code files needed (e.g. src/main.rs, app.py, requirements.txt, Cargo.toml) and put them in the 'files' array. Ensure your 'path' properties respect language conventions (e.g. for Rust, 'Cargo.toml' is in the root, but 'src/main.rs' must be inside a 'src' folder!). Keep code extremely short and minimal (hello world level with the requested DB connected) to avoid cutting off the JSON.
In your docker-compose, you can mount these files into the container using:
volumes:
  - .:/app
and set the working_dir to /app, and the command to run/compile the app on the fly (e.g. 'cargo run' or 'python app.py').
The runtime field should be "docker".
${generateDesc ? '\nAlso generate a short engaging repository description based on the prompt in the "description" field.' : ''}

User Request: "${userPrompt}"

Respond ONLY with valid JSON in this exact format, with no markdown formatting or backticks. DO NOT output any reasoning blocks or <think> tags. Output the JSON object immediately:
{"name": "generated-name", "runtime": "docker", "dockerCompose": "version: '3'\\n...", "files": [{"path": "src/app.py", "content": "print('hello')"}]${generateDesc ? ', "description": "generated description"' : ''}}
    `.trim();


    const response = await this.aiProxy.complete(tenantId, prompt, 'infrastructure-provisioning');
    
    try {
      let cleanOutput = response.output.trim();
      if (cleanOutput.startsWith('\`\`\`json')) {
         cleanOutput = cleanOutput.replace(/\`\`\`json/g, '').replace(/\`\`\`/g, '').trim();
      } else if (cleanOutput.startsWith('\`\`\`')) {
         cleanOutput = cleanOutput.replace(/\`\`\`/g, '').trim();
      }

      
      const parsed = JSON.parse(cleanOutput);
      
      if (!parsed.name || !parsed.runtime || !parsed.dockerCompose) {
        throw new Error('Invalid JSON structure returned by LLM');
      }

      const finalRepoName = repoName || parsed.name;
      const finalRepoDesc = repoDesc || parsed.description || '';
      
      let githubRepoUrl = undefined;
      
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
    } catch (err) {
      throw new BadRequestException('Failed to parse AI response into infrastructure: ' + err.message + '. Raw response: ' + response.output);
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
2. Return complete, production-ready file contents for every modified or new file (do not truncate or use placeholders).
3. Generate a concise, conventional git commit message (e.g. "feat: add /api/users endpoint").
4. Provide a brief 1-2 sentence human summary of changes.

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
      let cleanOutput = response.output.trim();
      if (cleanOutput.startsWith('```json')) {
        cleanOutput = cleanOutput.replace(/```json/g, '').replace(/```/g, '').trim();
      } else if (cleanOutput.startsWith('```')) {
        cleanOutput = cleanOutput.replace(/```/g, '').trim();
      }

      const parsed = JSON.parse(cleanOutput);
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
            console.error('Failed to create repo during iteration', e);
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
      throw new BadRequestException('Failed to process AI changes: ' + err.message + '. Raw response: ' + response.output);
    }
  }
}
