import { Controller, Post, Body, ForbiddenException, Sse } from '@nestjs/common';
import { Observable } from 'rxjs';
import { AiProxyService } from './ai-proxy.service';
import { OpsInsightService } from './ops-insight.service';
import { AiProvisioningService } from './ai-provisioning.service';
import { CompleteAiDto } from './dto/complete-ai.dto';
import { ProvisionAiDto } from './dto/provision-ai.dto';
import { TenantId, SYSTEM_TENANT_ID } from '../auth/tenant.decorator';

@Controller('v1/ai')
export class AiProxyController {
  constructor(
    private readonly aiProxyService: AiProxyService,
    private readonly opsInsightService: OpsInsightService,
    private readonly aiProvisioningService: AiProvisioningService,
  ) {}

  @Post('complete')
  complete(@TenantId() tenantId: string, @Body() body: CompleteAiDto) {
    this.assertTenant(tenantId);
    return this.aiProxyService.complete(
      tenantId,
      body.prompt,
      body.purpose,
      body.applicationId,
    );
  }

  @Sse('complete/stream')
  streamComplete(@TenantId() tenantId: string, @Body() body: CompleteAiDto): Observable<MessageEvent> {
    this.assertTenant(tenantId);
    return this.aiProxyService.completeStream(
      tenantId,
      body.prompt,
      body.purpose,
      body.applicationId,
    );
  }

  @Post('insights/ops')
  generateOpsInsight(@TenantId() tenantId: string) {
    this.assertTenant(tenantId);
    return this.opsInsightService.generate(tenantId);
  }

  @Post('provision')
  provision(@TenantId() tenantId: string, @Body() body: ProvisionAiDto) {
    this.assertTenant(tenantId);
    return this.aiProvisioningService.provisionFromPrompt(
      tenantId,
      body.prompt,
      body.repositoryName,
      body.repositoryDescription,
      body.generateDescription
    );
  }

  private assertTenant(tenantId: string) {
    if (tenantId === SYSTEM_TENANT_ID) {
      throw new ForbiddenException('Agent cannot consume AI quota');
    }
  }
}
