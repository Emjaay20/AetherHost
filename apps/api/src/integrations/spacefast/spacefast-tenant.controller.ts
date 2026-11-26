import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { IsBoolean } from 'class-validator';
import { ActorTenantId, TenantId } from '../../auth/tenant.decorator';
import { SpacefastTenantService } from './spacefast-tenant.service';

class PublishSpacefastDto {
  @IsBoolean()
  consent!: boolean;
}

@Controller('v1/external-frontends')
export class SpacefastTenantController {
  constructor(private readonly service: SpacefastTenantService) {}

  @Get()
  list(@TenantId() tenantId: string) {
    return this.service.list(tenantId);
  }

  @Post(':applicationId/spacefast/publish')
  publish(
    @TenantId() tenantId: string,
    @ActorTenantId() actorTenantId: string,
    @Param('applicationId') applicationId: string,
    @Body() body: PublishSpacefastDto,
  ) {
    return this.service.publish(tenantId, applicationId, body.consent, actorTenantId);
  }

  @Post(':applicationId/spacefast/refresh')
  refresh(@TenantId() tenantId: string, @Param('applicationId') applicationId: string) {
    return this.service.refresh(tenantId, applicationId);
  }
}
