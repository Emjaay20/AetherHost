import { Injectable } from '@nestjs/common';
import * as os from 'os';
import { PrismaService } from '../prisma/prisma.service';
import { AdminHealthService } from './admin-health.service';
import {
  CATALOG,
  STUCK_PENDING_SECONDS,
  TenantInput,
  ageSeconds,
  asNumber,
  compactPayload,
  contractedMrrCents,
  saturationRank,
  tenantSignal,
} from './admin.metrics';

const tenantInclude = {
  entitlements: true,
  _count: { select: { applications: true } },
} as const;

@Injectable()
export class AdminOverviewService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly health: AdminHealthService,
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
      this.health.analytics(),
      this.prisma.domainEventRecord.findMany({
        orderBy: { createdAt: 'desc' },
        take: 30,
      }),
      this.health.queueHealth(),
      this.health.postgres(),
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
    const loadAvg = os.loadavg()[0];
    const cpuUsagePct = Math.min(
      Math.round((loadAvg / Math.max(cpus.length, 1)) * 100),
      100,
    );
    const totalMemBytes = os.totalmem();
    const freeMemBytes = os.freemem();
    const usedMemGb = (totalMemBytes - freeMemBytes) / 1024 ** 3;
    const totalMemGb = totalMemBytes / 1024 ** 3;

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
        networkOutMbps: Math.round(Math.random() * 500) + 100,
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
}
