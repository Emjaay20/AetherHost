import { Controller, Get, Param } from '@nestjs/common';
import { EntitlementsService } from './entitlements.service';

@Controller('v1/entitlements')
export class EntitlementsController {
  constructor(private readonly entitlementsService: EntitlementsService) {}

  @Get(':tenantId')
  getForTenant(@Param('tenantId') tenantId: string) {
    return this.entitlementsService.getForTenant(tenantId);
  }
}
