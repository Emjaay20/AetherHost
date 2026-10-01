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

  async processWebhook(
    provider: string,
    providerEventId: string,
    tenantId: string,
    planId: string,
    status: string = 'succeeded',
  ) {
    const plan = PLANS[planId];
    if (!plan) {
      throw new BadRequestException(`Unknown plan: ${planId}`);
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        await tx.webhookEvent.create({
          data: {
            provider,
            providerEventId,
            tenantId,
            planId,
            status,
          },
        });

        await this.entitlements.applyPlan(tenantId, plan, tx);

        await this.events.publish(
          new PaymentSucceeded(tenantId, {
            provider,
            providerEventId,
            planId,
            status,
          }),
          tx,
        );

        this.logger.log(
          `Successfully processed webhook ${providerEventId} and applied plan ${planId} to ${tenantId}`,
        );
        return { message: 'Plan applied successfully' };
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        this.logger.log(`Webhook already processed: ${providerEventId}`);
        return { message: 'Already processed' };
      }
      throw error;
    }
  }
}

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code: string }).code === 'P2002'
  );
}
