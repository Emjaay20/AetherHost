import { Module } from '@nestjs/common';
import { CustomerSuccessService } from './customer-success.service';
import { CustomerSuccessController } from './customer-success.controller';
import { ChiliPiperWebhookController } from '../webhooks/chilipiper-webhook.controller';
import { SalesforceModule } from '../integrations/salesforce/salesforce.module';

@Module({
  imports: [SalesforceModule],
  controllers: [CustomerSuccessController, ChiliPiperWebhookController],
  providers: [CustomerSuccessService],
  exports: [CustomerSuccessService],
})
export class CustomerSuccessModule {}
