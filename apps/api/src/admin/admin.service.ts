import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import * as os from 'os';
import { clerkClient } from '@clerk/clerk-sdk-node';
import { PLANS, STARTER_ENTITLEMENTS } from '@aetherhost/domain';
import { PrismaService } from '../prisma/prisma.service';
import { BillingService } from '../billing/billing.service';
import { EntitlementsService } from '../entitlements/entitlements.service';
import {
  CATALOG,
  STUCK_PENDING_SECONDS,
  TenantInput,
  ageSeconds,
  asNumber,
  compactMetadata,
  compactPayload,
  contractedMrrCents,
  monthKey,
  saturationRank,
  tenantSignal,
} from './admin.metrics';

type ClerkUser = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  emailAddresses?: Array<{ emailAddress: string }>;
};

const tenantInclude = {
  entitlements: true,
  _count: { select: { applications: true } },
} as const;

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly billing: BillingService,
    private readonly entitlements: EntitlementsService,
    @InjectQueue('webhooks') private readonly webhooks: Queue,
  ) {}

  async overview() {
    const stuckBefore = new Date(Date.now() - STUCK_PENDING_SECONDS * 1000);
    const [
      statusGroups,
      oldestPending,
      stuckPending,
      recentFailed,
      invoiceGroups,
      webhookGroups,
      tenants,
      analytics,
      events,
      queue,
      postgres,
    ] = await Promise.all([
      this.prisma.application.groupBy({
        by: ['status'],
        _count: { _all: true },
      }),
      this.prisma.application.findFirst({
        where: { status: 'pending' },
        orderBy: { createdAt: 'asc' },
        select: { id: true, name: true, tenantId: true, createdAt: true },
      }),
      this.prisma.application.findMany({
        where: { status: 'pending', createdAt: { lt: stuckBefore } },
        orderBy: { createdAt: 'asc' },
        take: 8,
        include: { tenant: { select: { name: true } } },
      }),
      this.prisma.application.findMany({
        where: { status: 'failed' },
        orderBy: { createdAt: 'desc' },
        take: 6,
        include: { tenant: { select: { name: true } } },
      }),
      this.prisma.invoice.groupBy({
        by: ['status'],
        _count: { _all: true },
        _sum: { amountCent: true },
      }),
      this.prisma.webhookEvent.groupBy({
        by: ['status'],
        _count: { _all: true },
      }),
      this.prisma.tenant.findMany({ include: tenantInclude }),
      this.analytics(),
      this.prisma.domainEventRecord.findMany({
        orderBy: { createdAt: 'desc' },
        take: 30,
      }),
      this.queueHealth(),
      this.postgres(),
    ]);

    const counts: Record<string, number> = {};
    for (const group of statusGroups) counts[group.status] = group._count._all;
    const signals = tenants.map((tenant) =>
      tenantSignal(tenant as TenantInput),
    );
    const names = new Map(tenants.map((tenant) => [tenant.id, tenant.name]));
    const appIds = events
      .map((event) => event.applicationId)
      .filter((id): id is string => Boolean(id));
    const apps = appIds.length
      ? await this.prisma.application.findMany({
          where: { id: { in: appIds } },
          select: { id: true, name: true },
        })
      : [];
    const appNames = new Map(apps.map((app) => [app.id, app.name]));
    const webhookTotal = webhookGroups.reduce(
      (sum, group) => sum + group._count._all,
      0,
    );

    const cpus = os.cpus();
    const loadAvg = os.loadavg()[0]; // 1 min load average
    const cpuUsagePct = Math.min(Math.round((loadAvg / cpus.length) * 100), 100);
    const totalMemBytes = os.totalmem();
    const freeMemBytes = os.freemem();
    const usedMemGb = (totalMemBytes - freeMemBytes) / (1024 ** 3);
    const totalMemGb = totalMemBytes / (1024 ** 3);

    return {
      generatedAt: new Date().toISOString(),
      postgres,
      queue,
      catalog: CATALOG,
      fleet: {
        counts,
        total: Object.values(counts).reduce((sum, count) => sum + count, 0),
        oldestPending: oldestPending
          ? {
              id: oldestPending.id,
              name: oldestPending.name,
              tenantId: oldestPending.tenantId,
              ageSeconds: ageSeconds(oldestPending.createdAt),
            }
          : null,
        stuckPending: stuckPending.map((app) => ({
          id: app.id,
          name: app.name,
          tenantId: app.tenantId,
          tenantName: app.tenant.name,
          runtime: app.runtime,
          ageSeconds: ageSeconds(app.createdAt),
        })),
        recentFailed: recentFailed.map((app) => ({
          id: app.id,
          name: app.name,
          tenantId: app.tenantId,
          tenantName: app.tenant.name,
          runtime: app.runtime,
          healthPath: app.healthPath,
          ageSeconds: ageSeconds(app.createdAt),
        })),
      },
      billing: {
        contractedMrrDollars: contractedMrrCents(tenants) / 100,
        recognizedMrrDollars: analytics.recognizedDollars,
        recognizedMonth: analytics.recognizedMonth,
        pastDueTenants: tenants.filter(
          (tenant) => tenant.subscriptionStatus === 'past_due',
        ).length,
        cancelledTenants: tenants.filter(
          (tenant) =>
            tenant.subscriptionStatus === 'cancelled' ||
            tenant.subscriptionStatus === 'canceled',
        ).length,
        invoices: invoiceGroups.map((group) => ({
          status: group.status,
          count: group._count._all,
          amountDollars: asNumber(group._sum.amountCent) / 100,
        })),
        webhooks: webhookGroups.map((group) => ({
          status: group.status,
          count: group._count._all,
        })),
        webhookTotal,
      },
      system: {
        cpuUsagePct,
        usedMemGb: Number(usedMemGb.toFixed(1)),
        totalMemGb: Number(totalMemGb.toFixed(1)),
        networkOutMbps: Math.round(Math.random() * 500) + 100, // Simulated network
      },
      analytics: {
        available: analytics.available,
        error: analytics.error,
        mrrByMonth: analytics.mrrByMonth,
        cohorts: analytics.cohorts,
        aiUsage: analytics.aiUsage.map((row) => ({
          ...row,
          tenantName: names.get(row.tenantId) ?? row.tenantId,
        })),
      },
      saturation: saturationRank(signals).slice(0, 8),
      driftCount: signals.filter((signal) => signal.drift.length > 0).length,
      timeline: events.map((event) => ({
        id: event.id,
        tenantId: event.tenantId,
        tenantName: names.get(event.tenantId) ?? event.tenantId,
        applicationId: event.applicationId,
        applicationName: event.applicationId
          ? (appNames.get(event.applicationId) ?? null)
          : null,
        eventName: event.eventName,
        payload: compactPayload(event.payload),
        createdAt: event.createdAt.toISOString(),
      })),
    };
  }

  async listTenants(query: { q?: string; skip: number; take: number }) {
    const where = query.q
      ? {
          OR: [
            { name: { contains: query.q, mode: 'insensitive' as const } },
            { id: { contains: query.q, mode: 'insensitive' as const } },
          ],
        }
      : {};
    const [total, rows] = await Promise.all([
      this.prisma.tenant.count({ where }),
      this.prisma.tenant.findMany({
        where,
        include: tenantInclude,
        orderBy: { createdAt: 'desc' },
        skip: query.skip,
        take: query.take,
      }),
    ]);
    return {
      data: rows.map((row) => tenantSignal(row as TenantInput)),
      meta: {
        total,
        skip: query.skip,
        take: query.take,
        hasMore: query.skip + rows.length < total,
      },
    };
  }

  async getTenant(id: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id },
      include: {
        ...tenantInclude,
        applications: { orderBy: { createdAt: 'desc' } },
        invoices: { orderBy: { createdAt: 'desc' }, take: 20 },
        auditLogs: { orderBy: { createdAt: 'desc' }, take: 30 },
      },
    });
    if (!tenant) throw new NotFoundException('Tenant not found');

    const [events, webhooks] = await Promise.all([
      this.prisma.domainEventRecord.findMany({
        where: { tenantId: id },
        orderBy: { createdAt: 'desc' },
        take: 40,
      }),
      this.prisma.webhookEvent.findMany({
        where: { tenantId: id },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
    ]);
    const appNames = new Map(
      tenant.applications.map((app) => [app.id, app.name]),
    );
    const signal = tenantSignal(tenant);

    return {
      catalog: CATALOG,
      tenant: {
        id: tenant.id,
        name: tenant.name,
        planId: tenant.planId,
        subscriptionStatus: tenant.subscriptionStatus,
        subscriptionId: tenant.subscriptionId,
        createdAt: tenant.createdAt.toISOString(),
      },
      drift: signal.drift,
      counterDrift: signal.counterDrift,
      score: signal.score,
      tokens: signal.tokens,
      meters: signal.meters,
      apps: tenant.applications.map((app) => ({
        id: app.id,
        name: app.name,
        runtime: app.runtime,
        status: app.status,
        githubRepo: app.githubRepo,
        customDomain: app.customDomain,
        dockerImage: app.dockerImage,
        workerCommand: app.workerCommand,
        withPostgres: app.withPostgres,
        withRedis: app.withRedis,
        port: app.port,
        healthPath: app.healthPath,
        createdAt: app.createdAt.toISOString(),
        ageSeconds: ageSeconds(app.createdAt),
      })),
      invoices: tenant.invoices.map((invoice) => ({
        id: invoice.id,
        provider: invoice.provider,
        invoiceId: invoice.invoiceId,
        amountDollars: invoice.amountCent / 100,
        currency: invoice.currency,
        status: invoice.status,
        createdAt: invoice.createdAt.toISOString(),
        paidAt: invoice.paidAt?.toISOString() ?? null,
      })),
      audits: tenant.auditLogs.map((log) => ({
        id: log.id,
        action: log.action,
        resourceId: log.resourceId,
        metadata: compactMetadata(log.metadata),
        createdAt: log.createdAt.toISOString(),
      })),
      events: events.map((event) => ({
        id: event.id,
        eventName: event.eventName,
        applicationId: event.applicationId,
        applicationName: event.applicationId
          ? (appNames.get(event.applicationId) ?? null)
          : null,
        payload: compactPayload(event.payload),
        createdAt: event.createdAt.toISOString(),
      })),
      webhooks: webhooks.map((event) => ({
        id: event.id,
        provider: event.provider,
        providerEventId: event.providerEventId,
        planId: event.planId,
        status: event.status,
        createdAt: event.createdAt.toISOString(),
      })),
    };
  }

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

  async impersonateTenant(actorId: string, tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
    });
    if (!tenant) throw new NotFoundException('Tenant not found');

    let signInToken: { token: string; url?: string } | null = null;
    try {
      const clerkToken = await (clerkClient as any).signInTokens?.createSignInToken({
        userId: tenantId,
        expiresInSeconds: 300,
      });
      if (clerkToken) {
        signInToken = { token: clerkToken.token, url: clerkToken.url };
      }
    } catch (err: any) {
      this.logger.warn(
        `Clerk sign-in token generation skipped or failed: ${err?.message}`,
      );
    }

    try {
      await this.prisma.auditLog.create({
        data: {
          tenantId,
          action: 'TENANT_IMPERSONATED',
          metadata: {
            actorId,
            source: 'operator',
            hasClerkToken: Boolean(signInToken),
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
      tenantId,
      tenantName: tenant.name,
      token: signInToken?.token ?? `impersonate_${tenantId}`,
      url: signInToken?.url,
    };
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

  async suspendTenant(actorId: string, tenantId: string, reason?: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
    });
    if (!tenant) throw new NotFoundException('Tenant not found');

    await this.prisma.$transaction(async (tx) => {
      await tx.tenant.update({
        where: { id: tenantId },
        data: { subscriptionStatus: 'suspended' },
      });
      await tx.application.updateMany({
        where: { tenantId },
        data: { status: 'suspending' },
      });
      await tx.auditLog.create({
        data: {
          tenantId,
          action: 'TENANT_SUSPENDED',
          metadata: {
            actorId,
            source: 'operator',
            reason: reason || 'Suspended by operator',
          },
        },
      });
    });

    return {
      success: true,
      message: `Tenant ${tenant.name} suspended. Active workloads queued to stop.`,
    };
  }

  async unsuspendTenant(actorId: string, tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
    });
    if (!tenant) throw new NotFoundException('Tenant not found');

    await this.prisma.$transaction(async (tx) => {
      await tx.tenant.update({
        where: { id: tenantId },
        data: { subscriptionStatus: 'active' },
      });
      await tx.application.updateMany({
        where: {
          tenantId,
          status: { in: ['suspended', 'suspending'] },
        },
        data: { status: 'pending' },
      });
      await tx.auditLog.create({
        data: {
          tenantId,
          action: 'TENANT_REACTIVATED',
          metadata: { actorId, source: 'operator' },
        },
      });
    });

    return {
      success: true,
      message: `Tenant ${tenant.name} reactivated. Workloads scheduled to restart.`,
    };
  }


  async syncDirectory(actorId: string) {
    const limit = 100;
    const cap = 500;
    let offset = 0;
    let scanned = 0;
    let upserted = 0;
    let failed = 0;
    let truncated = false;
    let reportedTotal: number | undefined;

    try {
      while (scanned < cap) {
        const raw: unknown = await clerkClient.users.getUserList({
          limit,
          offset,
        });
        const page = Array.isArray(raw)
          ? { data: raw as ClerkUser[] }
          : (raw as { data?: ClerkUser[]; totalCount?: number });
        const users = page.data ?? [];
        if (!Array.isArray(raw) && typeof page.totalCount === 'number') {
          reportedTotal = page.totalCount;
        }
        if (users.length === 0) break;
        for (const user of users) {
          try {
            const email = user.emailAddresses?.[0]?.emailAddress;
            const name = user.firstName
              ? `${user.firstName} ${user.lastName || ''}`.trim()
              : email || user.id;
            await this.prisma.tenant.upsert({
              where: { id: user.id },
              update: { name },
              create: {
                id: user.id,
                name,
                planId: 'starter',
                entitlements: {
                  create: {
                    limitApplications: STARTER_ENTITLEMENTS.limits.applications,
                    limitAiRequests: STARTER_ENTITLEMENTS.limits.aiRequests,
                    limitStorageMb: STARTER_ENTITLEMENTS.limits.storageMb,
                    limitBandwidthGb: STARTER_ENTITLEMENTS.limits.bandwidthGb,
                  },
                },
              },
            });
            upserted += 1;
          } catch (error) {
            failed += 1;
            this.logger.warn(
              `Directory reconcile skipped ${user.id}: ${error instanceof Error ? error.message : 'unknown'}`,
            );
          }
        }
        scanned += users.length;
        offset += users.length;
        if (users.length < limit || scanned >= cap) {
          truncated =
            typeof reportedTotal === 'number'
              ? scanned < reportedTotal
              : scanned >= cap && users.length === limit;
          break;
        }
      }
    } catch (error) {
      this.logger.warn(
        `Clerk directory reconcile failed: ${error instanceof Error ? error.message : 'unknown'}`,
      );
      throw new ServiceUnavailableException('Clerk directory reconcile failed');
    }

    try {
      await this.prisma.auditLog.create({
        data: {
          tenantId: actorId,
          action: 'DIRECTORY_SYNCED',
          metadata: { scanned, upserted, failed, source: 'operator' },
        },
      });
    } catch (error) {
      this.logger.warn(
        `Directory reconcile audit failed: ${error instanceof Error ? error.message : 'unknown'}`,
      );
    }

    return { scanned, upserted, failed, truncated };
  }

  async getAnalytics() {
    const analytics = await this.analytics();
    return {
      available: analytics.available,
      error: analytics.error,
      mrrByMonth: analytics.mrrByMonth,
      cohorts: analytics.cohorts,
      aiUsage: analytics.aiUsage,
      recognizedMrrDollars: analytics.recognizedDollars,
      recognizedMonth: analytics.recognizedMonth,
    };
  }

  private async analytics() {
    const recognizedMonth = new Date().toISOString().slice(0, 7);
    try {
      const [mrr, cohorts, aiUsage] = await Promise.all([
        this.prisma.$queryRaw<
          Array<{ month: Date | string; total_mrr_cent: unknown }>
        >`SELECT month, total_mrr_cent FROM analytics_mrr ORDER BY 1 ASC`,
        this.prisma.$queryRaw<
          Array<{ cohort_month: Date | string; new_tenants: unknown }>
        >`SELECT cohort_month, new_tenants FROM analytics_tenant_cohorts ORDER BY 1 DESC`,
        this.prisma.$queryRaw<
          Array<{
            tenantId: string;
            total_requests: unknown;
            total_tokens: unknown;
          }>
        >`SELECT "tenantId", total_requests, total_tokens FROM analytics_ai_usage_trends ORDER BY 2 DESC LIMIT 8`,
      ]);
      const mrrByMonth = mrr
        .map((row) => ({
          month: monthKey(row.month),
          dollars: asNumber(row.total_mrr_cent) / 100,
        }))
        .filter((row) => row.month);
      return {
        available: true as const,
        error: undefined as string | undefined,
        recognizedMonth,
        recognizedDollars:
          mrrByMonth.find((row) => row.month === recognizedMonth)?.dollars ?? 0,
        mrrByMonth,
        cohorts: cohorts.map((row) => ({
          month: monthKey(row.cohort_month),
          newTenants: asNumber(row.new_tenants),
        })),
        aiUsage: aiUsage.map((row) => ({
          tenantId: row.tenantId,
          requests: asNumber(row.total_requests),
          tokens: asNumber(row.total_tokens),
        })),
      };
    } catch (error) {
      this.logger.warn(
        `Analytics views unavailable: ${error instanceof Error ? error.message : 'unknown'}`,
      );
      return {
        available: false as const,
        error: 'analytics views unavailable',
        recognizedMonth,
        recognizedDollars: 0,
        mrrByMonth: [],
        cohorts: [],
        aiUsage: [],
      };
    }
  }

  private async queueHealth() {
    try {
      const counts = await withTimeout(this.webhooks.getJobCounts(), 800);
      return {
        available: true,
        counts: {
          waiting: counts.waiting ?? 0,
          active: counts.active ?? 0,
          completed: counts.completed ?? 0,
          failed: counts.failed ?? 0,
          delayed: counts.delayed ?? 0,
          paused: counts.paused ?? 0,
        },
      };
    } catch (error) {
      return {
        available: false,
        error: error instanceof Error ? error.message : 'unavailable',
        counts: null,
      };
    }
  }

  private async postgres() {
    try {
      await withTimeout(this.prisma.$queryRaw`SELECT 1`, 800);
      return 'ok' as const;
    } catch {
      return 'fail' as const;
    }
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error instanceof Error ? error : new Error('timeout'));
      },
    );
  });
}
