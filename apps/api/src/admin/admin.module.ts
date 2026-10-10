import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { BillingModule } from '../billing/billing.module';
import { EntitlementsModule } from '../entitlements/entitlements.module';

@Module({
  imports: [BillingModule, EntitlementsModule],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
