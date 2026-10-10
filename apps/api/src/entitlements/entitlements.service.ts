import { Injectable, Inject } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import { InjectMetric } from '@willsoto/nestjs-prometheus';
import { Counter } from 'prom-client';
import {
  TenantEntitlements,
  STARTER_ENTITLEMENTS,
} from '@aetherhost/domain';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { PLANS, CatalogPlan } from '@aetherhost/domain';

export interface TenantEntitlementsView {
  planId: string;
  subscriptionStatus: string;
  limits: {
    applications: number;
    aiRequests: number;
    storageMb: number;
    bandwidthMb: number;
  };
  usage: {
    applications: number;
    aiRequests: number;
    storageMb: number;
    bandwidthMb: number;
  };
  metrics: {
    totalAiTokens: number;
    currentMemoryMb: number;
  };
}

@Injectable()
export class EntitlementsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
    @InjectMetric('aetherhost_applications_provisioned_total') public appCounter: Counter<string>,
    @InjectMetric('aetherhost_ai_requests_total') public aiCounter: Counter<string>
  ) {}

  async getForTenant(
    tenantId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<TenantEntitlementsView> {
    const prismaClient = tx || this.prisma;
    
    const cacheKey = `entitlements:${tenantId}`;
    if (!tx) {
      const cached = await this.cacheManager.get<TenantEntitlementsView>(cacheKey);
      if (cached) return cached;
    }

    let tenant = await prismaClient.tenant.findUnique({
      where: { id: tenantId },
      include: { entitlements: true }
    });

    if (!tenant) {
      tenant = await prismaClient.tenant.create({
        data: {
          id: tenantId, 
          name: tenantId, 
          planId: 'starter',
          entitlements: {
            create: {
              limitApplications: STARTER_ENTITLEMENTS.limits.applications,
              limitAiRequests: STARTER_ENTITLEMENTS.limits.aiRequests,
              limitStorageMb: STARTER_ENTITLEMENTS.limits.storageMb,
              limitBandwidthGb: STARTER_ENTITLEMENTS.limits.bandwidthGb,
            }
          }
        },
        include: { entitlements: true }
      });
    } else if (!tenant.entitlements) {
      const entitlements = await prismaClient.tenantEntitlement.create({
        data: {
          tenantId,
          limitApplications: STARTER_ENTITLEMENTS.limits.applications,
          limitAiRequests: STARTER_ENTITLEMENTS.limits.aiRequests,
          limitStorageMb: STARTER_ENTITLEMENTS.limits.storageMb,
          limitBandwidthGb: STARTER_ENTITLEMENTS.limits.bandwidthGb,
        }
      });
      tenant.entitlements = entitlements;
    }

    const record = tenant.entitlements!;

    const admins = (process.env.ADMIN_TENANT_IDS || '')
      .split(',')
      .map((id) => id.trim())
      .filter((id) => id.length > 0);
    const isAdmin = admins.includes(tenantId);

    const result = {
      planId: isAdmin ? 'max' : tenant.planId,
      subscriptionStatus: tenant.subscriptionStatus,
      limits: isAdmin 
        ? {
            applications: 999999,
            aiRequests: 999999,
            storageMb: 999999,
            bandwidthMb: 999999,
          }
        : {
            applications: record.limitApplications,
            aiRequests: record.limitAiRequests,
            storageMb: record.limitStorageMb || 512,
            bandwidthMb: (PLANS[tenant.planId as keyof typeof PLANS]?.entitlements?.limits?.bandwidthGb ?? 10) * 1024,
          },
      usage: {
        applications: record.usageApplications,
        aiRequests: record.usageAiRequests,
        storageMb: record.usageStorageMb || 0,
        bandwidthMb: record.usageBandwidthMb || 0,
      },
      metrics: {
        totalAiTokens: record.totalAiTokens,
        currentMemoryMb: record.currentMemoryMb,
      },
    };

    if (!tx) {
      await this.cacheManager.set(cacheKey, result, 60000);
    }

    return result;
  }

  async consumeApplicationSlot(
    tenantId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<boolean> {
    const prismaClient = tx || this.prisma;
    await this.getForTenant(tenantId, prismaClient);

    const admins = (process.env.ADMIN_TENANT_IDS || '')
      .split(',')
      .map((id) => id.trim())
      .filter((id) => id.length > 0);
    const isAdmin = admins.includes(tenantId);
    const condition = isAdmin ? Prisma.empty : Prisma.sql`AND "usageApplications" < "limitApplications"`;

    const updated = await prismaClient.$executeRaw`
      UPDATE "TenantEntitlement"
      SET "usageApplications" = "usageApplications" + 1
      WHERE "tenantId" = ${tenantId}
        ${condition}
    `;

    if (updated === 1) {
      this.appCounter.inc({ tenant_id: tenantId });
      await this.cacheManager.del(`entitlements:${tenantId}`);
    }

    return updated === 1;
  }

  async releaseApplicationSlot(
    tenantId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<boolean> {
    const prismaClient = tx || this.prisma;

    const updated = await prismaClient.$executeRaw`
      UPDATE "TenantEntitlement"
      SET "usageApplications" = "usageApplications" - 1
      WHERE "tenantId" = ${tenantId}
        AND "usageApplications" > 0
    `;

    if (updated === 1) {
      await this.cacheManager.del(`entitlements:${tenantId}`);
    }

    return updated === 1;
  }

  async consumeAiRequestSlot(
    tenantId: string,
    tokensUsed: number = 0,
    tx?: Prisma.TransactionClient,
  ): Promise<boolean> {
    const prismaClient = tx || this.prisma;
    await this.getForTenant(tenantId, prismaClient);

    const updated = await prismaClient.$executeRaw`
      UPDATE "TenantEntitlement"
      SET "usageAiRequests" = "usageAiRequests" + 1,
          "totalAiTokens" = "totalAiTokens" + ${tokensUsed}
      WHERE "tenantId" = ${tenantId}
        AND "usageAiRequests" < "limitAiRequests"
    `;

    if (updated === 1) {
      this.aiCounter.inc({ tenant_id: tenantId, model: 'proxy' });
      await this.cacheManager.del(`entitlements:${tenantId}`);
    }

    return updated === 1;
  }

  async canAiRequest(
    tenantId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<{ allowed: boolean }> {
    const prismaClient = tx || this.prisma;
    const record = await prismaClient.tenantEntitlement.findUnique({
      where: { tenantId },
      select: { usageAiRequests: true, limitAiRequests: true }
    });
    
    if (!record) return { allowed: false };

    return {
      allowed: record.usageAiRequests < record.limitAiRequests,
    };
  }

  async recordAiTokenUsage(
    tenantId: string,
    tokensUsed: number,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    const prismaClient = tx || this.prisma;
    await prismaClient.$executeRaw`
      UPDATE "TenantEntitlement"
      SET "totalAiTokens" = "totalAiTokens" + ${tokensUsed}
      WHERE "tenantId" = ${tenantId}
    `;
  }

  async applyPlan(
    tenantId: string,
    plan: CatalogPlan,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    const prismaClient = tx || this.prisma;
    await this.getForTenant(tenantId, prismaClient);

    await prismaClient.$executeRaw`
      UPDATE "TenantEntitlement"
      SET
        "limitApplications" = ${plan.entitlements.limits.applications},
        "limitAiRequests" = ${plan.entitlements.limits.aiRequests},
        "limitStorageMb" = ${plan.entitlements.limits.storageMb || 512},
        "limitBandwidthGb" = ${plan.entitlements.limits.bandwidthGb || 10}
      WHERE "tenantId" = ${tenantId}
    `;

    await prismaClient.tenant.update({
      where: { id: tenantId },
      data: { planId: plan.id },
    });
    await this.cacheManager.del(`entitlements:${tenantId}`);
  }
}
