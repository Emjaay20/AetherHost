import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';
import { EntitlementsModule } from '../entitlements/entitlements.module';
import { WebhookProcessor } from './webhook.processor';

@Module({
  imports: [
    EntitlementsModule,
    BullModule.registerQueue({
      name: 'webhooks',
    }),
  ],
  controllers: [BillingController],
  providers: [BillingService, WebhookProcessor],
})
export class BillingModule {}
