import { Injectable } from '@nestjs/common';
import * as fs from 'fs';
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

function readLinuxTxBytes(): number | null {
  try {
    if (!fs.existsSync('/proc/net/dev')) return null;
    const raw = fs.readFileSync('/proc/net/dev', 'utf8');
    let totalTxBytes = 0;
    for (const line of raw.split('\n').slice(2)) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const [ifacePart, statsPart] = trimmed.split(':');
      if (!ifacePart || !statsPart) continue;
      const iface = ifacePart.trim();
      if (iface === 'lo') continue;
      const fields = statsPart.trim().split(/\s+/);
      // In /proc/net/dev, field 0 is rx_bytes and field 8 is tx_bytes
      if (fields.length >= 9) {
        const tx = Number(fields[8]);
        if (Number.isFinite(tx) && tx >= 0) {
          totalTxBytes += tx;
        }
      }
    }
    return totalTxBytes;
  } catch {
    return null;
  }
}

@Injectable()
export class AdminOverviewService {
  private lastCpuSample: { busy: number; total: number } | null = null;
  private lastNetSample: { txBytes: number; timestampMs: number } | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly health: AdminHealthService,
  ) {}

  private sampleCpuUsagePct(): number {
    const cpus = os.cpus();
    let busy = 0;
    let total = 0;
    for (const cpu of cpus) {
      const t = cpu.times;
      const coreBusy = t.user + t.nice + t.sys + t.irq;
      busy += coreBusy;
      total += coreBusy + t.idle;
    }

    if (this.lastCpuSample && total > this.lastCpuSample.total) {
      const deltaBusy = busy - this.lastCpuSample.busy;
      const deltaTotal = total - this.lastCpuSample.total;
      this.lastCpuSample = { busy, total };
      return Math.min(100, Math.max(0, Math.round((deltaBusy / deltaTotal) * 100)));
    }

    this.lastCpuSample = { busy, total };
    if (total > 0) {
      return Math.min(100, Math.max(0, Math.round((busy / total) * 100)));
    }
    const loadAvg = os.loadavg()[0];
    return Math.min(Math.round((loadAvg / Math.max(cpus.length, 1)) * 100), 100);
  }

  private sampleNetworkOutMbps(): { networkOutMbps: number; measurementScope: string } {
    const txBytes = readLinuxTxBytes();
    const now = Date.now();
    if (txBytes !== null) {
      if (this.lastNetSample && now > this.lastNetSample.timestampMs && txBytes >= this.lastNetSample.txBytes) {
        const elapsedSec = (now - this.lastNetSample.timestampMs) / 1000;
        const deltaBytes = txBytes - this.lastNetSample.txBytes;
        this.lastNetSample = { txBytes, timestampMs: now };
        const mbps = elapsedSec > 0 ? (deltaBytes * 8) / (elapsedSec * 1_000_000) : 0;
        return {
          networkOutMbps: Number(mbps.toFixed(2)),
          measurementScope: 'host_kernel_proc_net_dev_tx_rate',
        };
      }
      this.lastNetSample = { txBytes, timestampMs: now };
      return {
        networkOutMbps: 0,
        measurementScope: 'host_kernel_proc_net_dev_baseline_sampled',
      };
    }

    return {
      networkOutMbps: 0,
      measurementScope: 'host_os_cpus_and_mem_only',
    };
  }

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

    const cpuUsagePct = this.sampleCpuUsagePct();
    const totalMemBytes = os.totalmem();
    const freeMemBytes = os.freemem();
    const usedMemGb = (totalMemBytes - freeMemBytes) / 1024 ** 3;
    const totalMemGb = totalMemBytes / 1024 ** 3;
    const { networkOutMbps, measurementScope } = this.sampleNetworkOutMbps();

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
        networkOutMbps,
        measurementScope,
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
      driftCount: signals.filter(
        (signal) => signal.drift.length > 0 || signal.counterDrift,
      ).length,
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
