import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { BillingService } from './billing.service';
import { Logger } from '@nestjs/common';

@Processor('webhooks')
export class WebhookProcessor extends WorkerHost {
  private readonly logger = new Logger(WebhookProcessor.name);

  constructor(private readonly billingService: BillingService) {
    super();
  }

  async process(job: Job<any, any, string>): Promise<any> {
    this.logger.log(`Processing webhook job ${job.id} for provider ${job.data.provider}`);
    const { provider, providerEventId, tenantId, planId, status } = job.data;
    
    try {
      await this.billingService.processWebhook(
        provider,
        providerEventId,
        tenantId,
        planId,
        status
      );
      this.logger.log(`Successfully processed webhook job ${job.id}`);
    } catch (error) {
      this.logger.error(`Failed to process webhook job ${job.id}`, error);
      throw error; // Let BullMQ retry
    }
  }
}
