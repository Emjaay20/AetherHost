import { Controller, Get, Query, ForbiddenException } from '@nestjs/common';
import { DomainEventsService } from './domain-events.service';
import { TenantId, SYSTEM_TENANT_ID } from '../auth/tenant.decorator';

@Controller('v1/events')
export class DomainEventsController {
  constructor(private readonly eventsService: DomainEventsService) {}

  @Get()
  getEvents(
    @TenantId() actorTenantId: string,
    @Query('tenantId') tenantId?: string,
  ) {
    const resolved = tenantId || actorTenantId;
    if (actorTenantId !== SYSTEM_TENANT_ID && resolved !== actorTenantId) {
      throw new ForbiddenException("Cannot read another tenant's events");
    }
    if (resolved === SYSTEM_TENANT_ID) {
      return [];
    }
    return this.eventsService.getForTenant(resolved);
  }
}
