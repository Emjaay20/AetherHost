import { Controller, Post, Body } from '@nestjs/common';
import { AiProxyService } from './ai-proxy.service';
import { OpsInsightService } from './ops-insight.service';
import { AiProvisioningService } from './ai-provisioning.service';

@Controller('v1/ai')
export class AiProxyController {
  constructor(
    private readonly aiProxyService: AiProxyService,
    private readonly opsInsightService: OpsInsightService,
    private readonly aiProvisioningService: AiProvisioningService,
  ) {}

  @Post('complete')
  complete(@Body() body: { tenantId: string; applicationId?: string; prompt: string; purpose: string }) {
    return this.aiProxyService.complete(body.tenantId, body.prompt, body.purpose, body.applicationId);
  }

  @Post('insights/ops')
  generateOpsInsight(@Body() body: { tenantId: string }) {
    return this.opsInsightService.generate(body.tenantId);
  }

  @Post('provision')
  provision(@Body() body: { tenantId: string; prompt: string }) {
    return this.aiProvisioningService.provisionFromPrompt(body.tenantId, body.prompt);
  }
}
