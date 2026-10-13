import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { AdminHealthService } from './admin-health.service';
import { AdminOverviewService } from './admin-overview.service';
import { AdminTenantService } from './admin-tenant.service';
import { AdminBillingService } from './admin-billing.service';
import { BillingModule } from '../billing/billing.module';
import { EntitlementsModule } from '../entitlements/entitlements.module';

@Module({
  imports: [BillingModule, EntitlementsModule],
  controllers: [AdminController],
  providers: [
    AdminHealthService,
    AdminOverviewService,
    AdminTenantService,
    AdminBillingService,
    AdminService,
  ],
  exports: [
    AdminService,
    AdminHealthService,
    AdminOverviewService,
    AdminTenantService,
    AdminBillingService,
  ],
})
export class AdminModule {}
