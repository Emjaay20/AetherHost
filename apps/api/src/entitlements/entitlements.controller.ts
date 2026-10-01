import { Controller, Get, Param, ForbiddenException } from '@nestjs/common';
import { EntitlementsService } from './entitlements.service';
import { TenantId, SYSTEM_TENANT_ID } from '../auth/tenant.decorator';

@Controller('v1/entitlements')
export class EntitlementsController {
  constructor(private readonly entitlementsService: EntitlementsService) {}

  @Get()
  getMine(@TenantId() tenantId: string) {
    if (tenantId === SYSTEM_TENANT_ID) {
      throw new ForbiddenException('Agent has no entitlements');
    }
    return this.entitlementsService.getForTenant(tenantId);
  }

  @Get(':tenantId')
  getForTenant(
    @TenantId() actorTenantId: string,
    @Param('tenantId') tenantId: string,
  ) {
    if (actorTenantId !== SYSTEM_TENANT_ID && actorTenantId !== tenantId) {
      throw new ForbiddenException("Cannot read another tenant's entitlements");
    }
    return this.entitlementsService.getForTenant(tenantId);
  }
}
