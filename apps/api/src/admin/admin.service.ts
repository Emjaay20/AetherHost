import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { clerkClient } from '@clerk/clerk-sdk-node';
import { STARTER_ENTITLEMENTS } from '@aetherhost/domain';

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  async getAllTenants() {
    try {
      const clerkUsers = await clerkClient.users.getUserList({ limit: 100 });
      
      // Auto-sync any Clerk users that are missing from the local DB (e.g., if DB was reset)
      for (const u of clerkUsers.data) {
        const email = u.emailAddresses[0]?.emailAddress;
        const name = u.firstName ? `${u.firstName} ${u.lastName || ''}`.trim() : (email || u.id);
        
        await this.prisma.tenant.upsert({
          where: { id: u.id },
          update: { name },
          create: {
            id: u.id,
            name,
            planId: 'starter',
            entitlements: {
              create: {
                limitApplications: STARTER_ENTITLEMENTS.limits.applications,
                limitAiRequests: STARTER_ENTITLEMENTS.limits.aiRequests,
                limitStorageMb: 512,
              }
            }
          }
        });
      }
    } catch (e) {
      console.warn('Failed to sync clerk users for admin dashboard:', e);
    }

    const tenants = await this.prisma.tenant.findMany({
      include: {
        entitlements: true,
        _count: {
          select: { applications: true }
        }
      },
      orderBy: { id: 'desc' }
    });

    return tenants;
  }

  async getAnalytics() {
    const mrr = await this.prisma.$queryRaw`SELECT * FROM analytics_mrr`;
    const cohorts = await this.prisma.$queryRaw`SELECT * FROM analytics_tenant_cohorts`;
    const aiUsage = await this.prisma.$queryRaw`SELECT * FROM analytics_ai_usage_trends`;
    
    return {
      mrr,
      cohorts,
      aiUsage
    };
  }
}
