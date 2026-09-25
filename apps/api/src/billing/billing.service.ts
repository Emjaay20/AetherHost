import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EntitlementsService } from '../entitlements/entitlements.service';
import { DomainEventsService } from '../events/domain-events.service';
import { PLANS, PaymentSucceeded } from '@aetherhost/domain';

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly entitlements: EntitlementsService,
    private readonly events: DomainEventsService,
  ) {}

  getPlans() {
    return Object.values(PLANS);
  }

  async processWebhook(provider: string, providerEventId: string, tenantId: string, planId: string, status: string = 'succeeded') {
    const plan = PLANS[planId];
    if (!plan) {
      throw new BadRequestException(`Unknown plan: ${planId}`);
    }

    return this.prisma.$transaction(async (tx) => {
      // 1. Idempotency Check
      const existing = await tx.webhookEvent.findUnique({
        where: { providerEventId },
      });

      if (existing) {
        this.logger.log(`Webhook already processed: ${providerEventId}`);
        return { message: 'Already processed' };
      }

      // 2. Insert WebhookEvent
      await tx.webhookEvent.create({
        data: {
          provider,
          providerEventId,
          tenantId,
          planId,
          status,
        },
      });

      // 3. Apply Plan
      await this.entitlements.applyPlan(tenantId, plan, tx);

      // 4. Emit Domain Event
      await this.events.publish(
        new PaymentSucceeded(tenantId, { provider, providerEventId, planId, status }),
        tx
      );

      this.logger.log(`Successfully processed webhook ${providerEventId} and applied plan ${planId} to ${tenantId}`);
      return { message: 'Plan applied successfully' };
    });
  }
}
