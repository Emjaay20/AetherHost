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

  async provisionFromPrompt(tenantId: string, userPrompt: string) {
    const prompt = `
You are an AI infrastructure architect.
The user wants to deploy a new application.
Determine a good name for it (lowercase, hyphenated, no spaces), and pick the closest runtime from this list: [wordpress, php, nodejs, python].
If you cannot determine the runtime, default to nodejs.

User Request: "${userPrompt}"

Respond ONLY with valid JSON in this exact format, with no markdown formatting or backticks:
{"name": "generated-name", "runtime": "nodejs"}
    `.trim();

    const response = await this.aiProxy.complete(tenantId, prompt, 'infrastructure-provisioning');
    
    try {
      // Groq might return markdown formatting despite instructions
      let cleanOutput = response.output.trim();
      if (cleanOutput.startsWith('\`\`\`json')) {
         cleanOutput = cleanOutput.replace(/\`\`\`json/g, '').replace(/\`\`\`/g, '').trim();
      } else if (cleanOutput.startsWith('\`\`\`')) {
         cleanOutput = cleanOutput.replace(/\`\`\`/g, '').trim();
      }

      const parsed = JSON.parse(cleanOutput);
      
      if (!parsed.name || !parsed.runtime) {
        throw new Error('Invalid JSON structure returned by LLM');
      }

      // Create the application in the DB (this will check entitlements too!)
      const app = await this.appsService.create(tenantId, parsed.name, parsed.runtime as Runtime);
      
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
