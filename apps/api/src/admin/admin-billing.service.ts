import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PLANS } from '@aetherhost/domain';
import { PrismaService } from '../prisma/prisma.service';
import { BillingService } from '../billing/billing.service';
import { EntitlementsService } from '../entitlements/entitlements.service';
import { tenantSignal } from './admin.metrics';

@Injectable()
export class AdminBillingService {
  private readonly logger = new Logger(AdminBillingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly billing: BillingService,
    private readonly entitlements: EntitlementsService,
    @InjectQueue('webhooks') private readonly webhooks: Queue,
  ) {}

  async applyOperatorPlan(
    actorId: string,
    tenantId: string,
    planId: string,
    idempotencyKey?: string,
  ) {
    if (!PLANS[planId]) {
      throw new BadRequestException(`Unknown plan: ${planId}`);
    }
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      include: { entitlements: true },
    });
    if (!tenant) throw new NotFoundException('Tenant not found');

    const drift = tenantSignal({
      ...tenant,
      _count: { applications: 0 },
    }).drift;

    if (tenant.planId === planId && drift.length === 0) {
      return { message: 'Already on plan', planId, reconciled: false };
    }

    if (tenant.planId === planId) {
      await this.entitlements.applyPlan(tenantId, PLANS[planId]);
      await this.prisma.auditLog.create({
        data: {
          tenantId,
          action: 'ENTITLEMENTS_RECONCILED',
          resourceId: planId,
          metadata: { actorId, source: 'operator', drift },
        },
      });
      return {
        message: 'Limits reconciled to catalog',
        planId,
        reconciled: true,
      };
    }

    const bucket = Math.floor(Date.now() / 10_000);
    const providerEventId = idempotencyKey
      ? `operator_${idempotencyKey}`
      : `operator_${tenantId}_${planId}_${bucket}`;
    const result = await this.billing.processWebhook(
      'operator',
      providerEventId,
      tenantId,
      planId,
      'succeeded',
      { id: actorId },
    );
    return { ...result, planId, reconciled: false };
  }

  async replayWebhooks(actorId: string, tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
    });
    if (!tenant) throw new NotFoundException('Tenant not found');

    let replayedJobsCount = 0;
    try {
      const failedJobs = await this.webhooks.getJobs(['failed']);
      for (const job of failedJobs) {
        if (job.data?.tenantId === tenantId) {
          await job.retry();
          replayedJobsCount++;
        }
      }
    } catch (error) {
      this.logger.warn(
        `Failed to inspect BullMQ failed jobs: ${error instanceof Error ? error.message : 'unknown'}`,
      );
    }

    const events = await this.prisma.webhookEvent.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });

    let reprocessedEventsCount = 0;
    for (const event of events) {
      try {
        const replayEventId = `replay_${Date.now()}_${event.providerEventId}`;
        await this.billing.processWebhook(
          event.provider,
          replayEventId,
          tenantId,
          event.planId,
          event.status === 'payment_failed' ? 'succeeded' : event.status,
          { id: actorId },
        );
        reprocessedEventsCount++;
      } catch (err) {
        this.logger.warn(
          `Failed replaying webhook ${event.providerEventId}: ${err instanceof Error ? err.message : 'unknown'}`,
        );
      }
    }

    if (events.length === 0 && replayedJobsCount === 0) {
      try {
        const replayEventId = `replay_operator_${tenantId}_${Date.now()}`;
        await this.billing.processWebhook(
          'operator',
          replayEventId,
          tenantId,
          tenant.planId,
          'succeeded',
          { id: actorId },
        );
        reprocessedEventsCount++;
      } catch (err) {
        this.logger.warn(
          `Replay fallback failed: ${err instanceof Error ? err.message : 'unknown'}`,
        );
      }
    }

    const totalReplayed = replayedJobsCount + reprocessedEventsCount;

    try {
      await this.prisma.auditLog.create({
        data: {
          tenantId,
          action: 'WEBHOOK_REPLAYED',
          metadata: {
            actorId,
            source: 'operator',
            replayedJobsCount,
            reprocessedEventsCount,
            totalReplayed,
          },
        },
      });
    } catch (error) {
      this.logger.warn(
        `Audit log failed: ${error instanceof Error ? error.message : 'unknown'}`,
      );
    }

    return {
      success: true,
      count: totalReplayed,
      message: `Replayed ${totalReplayed} event(s) for ${tenant.name}`,
    };
  }

  async issueRefund(
    actorId: string,
    tenantId: string,
    amountDollars?: number,
    reason?: string,
  ) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      include: {
        invoices: {
          where: { status: 'paid' },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });
    if (!tenant) throw new NotFoundException('Tenant not found');

    const latestInvoice = tenant.invoices[0];
    let refundedAmountDollars = 0;
    let invoiceId = '';

    if (latestInvoice) {
      refundedAmountDollars = amountDollars ?? latestInvoice.amountCent / 100;
      invoiceId = latestInvoice.invoiceId;
      await this.prisma.invoice.update({
        where: { id: latestInvoice.id },
        data: { status: 'refunded' },
      });
    } else {
      refundedAmountDollars = amountDollars ?? 29;
      invoiceId = `ref_${Date.now()}`;
      await this.prisma.invoice.create({
        data: {
          tenantId,
          provider: 'operator',
          invoiceId,
          amountCent: Math.round(refundedAmountDollars * 100),
          status: 'refunded',
          paidAt: new Date(),
        },
      });
    }

    try {
      await this.prisma.auditLog.create({
        data: {
          tenantId,
          action: 'INVOICE_REFUNDED',
          resourceId: invoiceId,
          metadata: {
            actorId,
            source: 'operator',
            amountDollars: refundedAmountDollars,
            reason: reason || 'Customer request',
          },
        },
      });
    } catch (error) {
      this.logger.warn(
        `Audit log failed: ${error instanceof Error ? error.message : 'unknown'}`,
      );
    }

    return {
      success: true,
      invoiceId,
      refundedAmountDollars,
      message: `Successfully issued refund of $${refundedAmountDollars.toFixed(2)} for ${tenant.name}`,
    };
  }
}
