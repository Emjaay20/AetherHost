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

  async getInvoices(tenantId: string, skip: number = 0, take: number = 10) {
    const [invoices, total] = await Promise.all([
      this.prisma.invoice.findMany({
        where: { tenantId },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.invoice.count({ where: { tenantId } })
    ]);

    return {
      data: invoices,
      meta: {
        total,
        skip,
        take,
        hasMore: skip + take < total
      }
    };
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

        if (status === 'canceled') {
          // Downgrade to starter
          const starterPlan = PLANS['starter'];
          await this.entitlements.applyPlan(tenantId, starterPlan, tx);
          
          // Suspend apps exceeding the new limit
          const apps = await tx.application.findMany({
            where: { tenantId },
            orderBy: { createdAt: 'asc' }
          });
          
          if (apps.length > starterPlan.entitlements.limits.applications) {
            const appsToSuspend = apps.slice(starterPlan.entitlements.limits.applications);
            await tx.application.updateMany({
              where: { id: { in: appsToSuspend.map(a => a.id) } },
              data: { status: 'suspended' }
            });
          }
          
          this.logger.log(`Downgraded ${tenantId} to starter due to cancellation`);
          return { message: 'Downgraded successfully' };
        }

        // 1. Create Invoice Record
        const invoiceAmount = plan.monthlyPriceCent || 0;
        if (invoiceAmount > 0) {
          await tx.invoice.upsert({
            where: { invoiceId: providerEventId },
            update: { status: 'paid', paidAt: new Date() },
            create: {
              tenantId,
              provider,
              invoiceId: providerEventId,
              amountCent: invoiceAmount,
              status: 'paid',
              paidAt: new Date(),
            }
          });
        }

        // 2. Audit Log
        await tx.auditLog.create({
          data: {
            tenantId,
            action: 'PLAN_UPGRADED',
            metadata: { planId, provider, providerEventId }
          }
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
