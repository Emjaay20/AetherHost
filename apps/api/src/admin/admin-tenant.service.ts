import {
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { clerkClient } from '@clerk/clerk-sdk-node';
import { STARTER_ENTITLEMENTS } from '@aetherhost/domain';
import { PrismaService } from '../prisma/prisma.service';
import {
  CATALOG,
  TenantInput,
  ageSeconds,
  compactMetadata,
  compactPayload,
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
export class AdminTenantService {
  private readonly logger = new Logger(AdminTenantService.name);

  constructor(private readonly prisma: PrismaService) {}

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
        withMariaDb: app.withMariaDb,
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

  async impersonateTenant(actorId: string, tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
    });
    if (!tenant) throw new NotFoundException('Tenant not found');

    let signInToken: { token: string; url?: string } | null = null;
    try {
      const clerkToken = await (
        clerkClient as unknown as {
          signInTokens?: {
            createSignInToken: (args: {
              userId: string;
              expiresInSeconds: number;
            }) => Promise<{ token: string; url?: string } | null>;
          };
        }
      ).signInTokens?.createSignInToken({
        userId: tenantId,
        expiresInSeconds: 300,
      });
      if (clerkToken) {
        signInToken = { token: clerkToken.token, url: clerkToken.url };
      }
    } catch (err: unknown) {
      this.logger.warn(
        `Clerk sign-in token generation skipped or failed: ${err instanceof Error ? err.message : String(err)}`,
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
}
