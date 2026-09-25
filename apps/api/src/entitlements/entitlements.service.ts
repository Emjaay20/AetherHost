import { Injectable } from '@nestjs/common';
import { TenantEntitlements, EntitlementAction, STARTER_ENTITLEMENTS, CatalogPlan } from '@aetherhost/domain';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';

@Injectable()
export class EntitlementsService {
  constructor(private readonly prisma: PrismaService) {}

  async getForTenant(tenantId: string, tx?: Prisma.TransactionClient): Promise<TenantEntitlements> {
    const prismaClient = tx || this.prisma;
    let record = await prismaClient.tenantEntitlement.findUnique({
      where: { tenantId }
    });
    
    if (!record) {
      // Create if it doesn't exist
      record = await prismaClient.tenantEntitlement.create({
        data: {
          tenant: {
            connectOrCreate: {
              where: { id: tenantId },
              create: { id: tenantId, name: tenantId, planId: 'starter' }
            }
          },
          limitApplications: STARTER_ENTITLEMENTS.limits.applications,
          usageApplications: STARTER_ENTITLEMENTS.usage.applications,
        }
      });
    }

    return {
      limits: { applications: record.limitApplications, aiRequests: record.limitAiRequests },
      usage: { applications: record.usageApplications, aiRequests: record.usageAiRequests },
      metrics: {
        totalAiTokens: record.totalAiTokens,
        currentMemoryMb: record.currentMemoryMb,
      }
    } as any;
  }

  async consumeApplicationSlot(tenantId: string, tx?: Prisma.TransactionClient): Promise<boolean> {
    const prismaClient = tx || this.prisma;
    await this.getForTenant(tenantId, prismaClient);
    
    const updated = await prismaClient.$executeRaw`
      UPDATE "TenantEntitlement"
      SET "usageApplications" = "usageApplications" + 1
      WHERE "tenantId" = ${tenantId}
        AND "usageApplications" < "limitApplications"
    `;
    
    return updated === 1;
  }

  async releaseApplicationSlot(tenantId: string, tx?: Prisma.TransactionClient): Promise<boolean> {
    const prismaClient = tx || this.prisma;
    
    const updated = await prismaClient.$executeRaw`
      UPDATE "TenantEntitlement"
      SET "usageApplications" = "usageApplications" - 1
      WHERE "tenantId" = ${tenantId}
        AND "usageApplications" > 0
    `;
    
    return updated === 1;
  }

  async consumeAiRequestSlot(tenantId: string, tokensUsed: number = 0, tx?: Prisma.TransactionClient): Promise<boolean> {
    const prismaClient = tx || this.prisma;
    await this.getForTenant(tenantId, prismaClient);
    
    const updated = await prismaClient.$executeRaw`
      UPDATE "TenantEntitlement"
      SET "usageAiRequests" = "usageAiRequests" + 1,
          "totalAiTokens" = "totalAiTokens" + ${tokensUsed}
      WHERE "tenantId" = ${tenantId}
        AND "usageAiRequests" < "limitAiRequests"
    `;
    
    return updated === 1;
  }

  async canAiRequest(tenantId: string, tx?: Prisma.TransactionClient): Promise<{ allowed: boolean }> {
    const prismaClient = tx || this.prisma;
    const entitlements = await this.getForTenant(tenantId, prismaClient);
    
    return {
      allowed: entitlements.usage.aiRequests < entitlements.limits.aiRequests
    };
  }

  async applyPlan(tenantId: string, plan: CatalogPlan, tx?: Prisma.TransactionClient): Promise<void> {
    const prismaClient = tx || this.prisma;
    await this.getForTenant(tenantId, prismaClient);
    
    await prismaClient.$executeRaw`
      UPDATE "TenantEntitlement"
      SET 
        "limitApplications" = ${plan.limits.applications},
        "limitAiRequests" = ${plan.limits.aiRequests}
      WHERE "tenantId" = ${tenantId}
    `;
  }
}
