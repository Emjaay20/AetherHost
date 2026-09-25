import { Module } from '@nestjs/common';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';
import { PrismaModule } from '../prisma/prisma.module';
import { EntitlementsModule } from '../entitlements/entitlements.module';
import { DomainEventsModule } from '../events/domain-events.module';

@Module({
  imports: [PrismaModule, EntitlementsModule, DomainEventsModule],
  controllers: [BillingController],
  providers: [BillingService],
})
export class BillingModule {}
