import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SpacefastService } from './spacefast.service';
import { SpacefastTenantService } from './spacefast-tenant.service';
import { SpacefastTenantController } from './spacefast-tenant.controller';

@Module({
  imports: [ConfigModule],
  controllers: [SpacefastTenantController],
  providers: [SpacefastService, SpacefastTenantService],
  exports: [SpacefastService, SpacefastTenantService],
})
export class SpacefastModule {}
