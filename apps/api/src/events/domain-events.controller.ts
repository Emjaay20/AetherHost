import { Controller, Get, Query } from '@nestjs/common';
import { DomainEventsService } from './domain-events.service';

@Controller('v1/events')
export class DomainEventsController {
  constructor(private readonly eventsService: DomainEventsService) {}

  @Get()
  getEvents(@Query('tenantId') tenantId: string) {
    if (tenantId) {
      return this.eventsService.getForTenant(tenantId);
    }
    return [];
  }
}
