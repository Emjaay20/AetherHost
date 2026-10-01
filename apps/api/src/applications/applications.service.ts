import {
  Injectable,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import {
  Application,
  Runtime,
  ApplicationProvisioningRequested,
} from '@aetherhost/domain';
import { slugify } from '@aetherhost/common';
import { EntitlementsService } from '../entitlements/entitlements.service';
import { DomainEventsService } from '../events/domain-events.service';
import { PrismaService } from '../prisma/prisma.service';
import { SYSTEM_TENANT_ID } from '../auth/tenant.decorator';

@Injectable()
export class ApplicationsService {
  constructor(
    private readonly entitlementsService: EntitlementsService,
    private readonly eventsService: DomainEventsService,
    private readonly prisma: PrismaService,
  ) {}

  async create(
    tenantId: string,
    name: string,
    runtime: Runtime,
    githubRepo?: string,
    dockerCompose?: string,
    aiFiles?: { path: string; content: string }[],
    githubRepoName?: string,
    githubRepoDescription?: string,
  ): Promise<Application> {
    return this.prisma.$transaction(async (tx) => {
      const slotConsumed =
        await this.entitlementsService.consumeApplicationSlot(tenantId, tx);
      if (!slotConsumed) {
        throw new ForbiddenException('Application limit reached');
      }

      const id = `app_${slugify(name)}_${randomUUID().slice(0, 8)}`;
      
      const newApp = await tx.application.create({
        data: {
          id,
          tenantId,
          name,
          runtime,
          status: 'pending',
          githubRepo,
          githubRepoName,
          githubRepoDescription,
          dockerCompose,
          aiFiles: aiFiles ? JSON.parse(JSON.stringify(aiFiles)) : null,
        },
      });

      await this.eventsService.publish(
        new ApplicationProvisioningRequested(tenantId, newApp.id),
        tx,
      );

      return newApp as unknown as Application;
    });
  }

  async findAll(
    status?: string,
    runtime?: string,
    tenantId?: string,
  ): Promise<any[]> {
    const where: Record<string, string> = {};
    if (status) where.status = status;
    if (runtime) where.runtime = runtime;
    if (tenantId && tenantId !== SYSTEM_TENANT_ID) where.tenantId = tenantId;

    const apps = await this.prisma.application.findMany({ where });
    
    // If the system agent is pulling pending apps, inject their GitHub tokens securely
    if (tenantId === SYSTEM_TENANT_ID && status === 'pending') {
      const clerkClient = require('@clerk/clerk-sdk-node').clerkClient;
      
      const appsWithTokens = await Promise.all(apps.map(async (app) => {
        let githubToken = null;
        try {
          // Fetch the user's OAuth token from Clerk!
          const tokenResponse = await clerkClient.users.getUserOauthAccessToken(app.tenantId, 'oauth_github');
          
          // Clerk returns a paginated response object: { data: [...], totalCount: 1 }
          // Or in older versions it might return an array directly. Handle both:
          const tokensArray = Array.isArray(tokenResponse) ? tokenResponse : (tokenResponse.data || []);
          
          if (tokensArray && tokensArray.length > 0) {
            githubToken = tokensArray[0].token;
          }
        } catch (err) {
          console.error("Clerk OAuth Token Fetch Error:", err);
          // User might not have GitHub connected, ignore
        }
        
        return {
          ...app,
          githubToken, // The Go agent will read this!
        };
      }));
      return appsWithTokens;
    }
    
    return apps;
  }

  async remove(id: string, tenantId: string): Promise<void> {
    await this.assertOwned(id, tenantId);
    await this.prisma.application.update({
      where: { id },
      data: { status: 'terminating' },
    });
  }

  async hardDelete(id: string, tenantId: string): Promise<void> {
    const app = await this.assertOwned(id, tenantId);

    await this.prisma.$transaction(async (tx) => {
      await tx.application.delete({ where: { id } });
      await this.entitlementsService.releaseApplicationSlot(app.tenantId, tx);
    });
  }

  async updateStatus(id: string, status: string): Promise<void> {
    await this.prisma.application.update({
      where: { id },
      data: { status },
    });
  }

  private async assertOwned(id: string, tenantId: string) {
    const app = await this.prisma.application.findUnique({ where: { id } });
    if (!app) {
      throw new NotFoundException('Application not found');
    }
    if (tenantId !== SYSTEM_TENANT_ID && app.tenantId !== tenantId) {
      throw new ForbiddenException(
        'Application does not belong to this tenant',
      );
    }
    return app;
  }
}
