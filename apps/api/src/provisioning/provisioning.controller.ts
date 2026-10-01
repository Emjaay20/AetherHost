import { Controller, Post, Param } from '@nestjs/common';
import { ProvisioningService } from './provisioning.service';
import { TenantId } from '../auth/tenant.decorator';

@Controller('v1/provisioning')
export class ProvisioningController {
  constructor(private readonly provisioningService: ProvisioningService) {}

  @Post('tick')
  tick(@TenantId() tenantId: string) {
    return this.provisioningService.tick(tenantId);
  }

  @Post(':applicationId')
  provisionApp(
    @TenantId() tenantId: string,
    @Param('applicationId') applicationId: string,
  ) {
    return this.provisioningService.provisionApp(applicationId, tenantId);
  }
}
