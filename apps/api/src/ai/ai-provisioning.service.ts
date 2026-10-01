import { Injectable, BadRequestException } from '@nestjs/common';
import { AiProxyService } from './ai-proxy.service';
import { ApplicationsService } from '../applications/applications.service';
import { Runtime } from '@aetherhost/domain';

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

Respond ONLY with valid JSON in this exact format, with no markdown formatting or backticks:
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

      const app = await this.appsService.create(tenantId, parsed.name, parsed.runtime as Runtime, undefined, parsed.dockerCompose, parsed.files, finalRepoName, finalRepoDesc);

      
      return {
        success: true,
        application: app,
        aiUsage: response.usage,
      };
    } catch (err) {
      throw new BadRequestException('Failed to parse AI response into infrastructure: ' + err.message + '. Raw response: ' + response.output);
    }
  }
}
