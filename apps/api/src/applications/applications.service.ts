import {
  Injectable,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { assertWorkloadSpec } from './workload-spec';
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

export type ApplicationWithToken = Application & { githubToken: string | null };

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
    dockerImage?: string,
    envVars?: Record<string, string>,
    workerCommand?: string,
    withPostgres?: boolean,
    withRedis?: boolean,
    port?: number,
    healthPath?: string,
  ): Promise<Application> {
    assertWorkloadSpec({
      runtime,
      dockerImage,
      envVars,
      workerCommand,
      withPostgres,
      withRedis,
      port,
      healthPath,
    });
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
          dockerImage: dockerImage?.trim() || null,
          envVars: envVars ? JSON.parse(JSON.stringify(envVars)) : null,
          workerCommand: workerCommand?.trim() || null,
          withPostgres,
          withRedis,
          port,
          healthPath,
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
  ): Promise<Application[]> {
    const where: Record<string, string> = {};
    if (status) where.status = status;
    if (runtime) where.runtime = runtime;
    if (tenantId && tenantId !== SYSTEM_TENANT_ID) where.tenantId = tenantId;

    return this.prisma.application.findMany({ where }) as unknown as Promise<Application[]>;
  }

  async remove(id: string, tenantId: string): Promise<void> {
    await this.assertOwned(id, tenantId);
    await this.updateStatus(id, 'terminating');
  }

  async hardDelete(id: string, tenantId: string): Promise<void> {
    const app = await this.assertOwned(id, tenantId);

    await this.prisma.$transaction(async (tx) => {
      await tx.application.delete({ where: { id } });
      await this.entitlementsService.releaseApplicationSlot(app.tenantId, tx);
    });
  }

  async updateStatus(id: string, status: string): Promise<void> {
    const app = await this.prisma.application.findUnique({ where: { id } });
    if (!app) throw new NotFoundException('App not found');

    // If transitioning from running/pending to failed or terminated, release the slot.
    if ((app.status !== 'failed' && app.status !== 'terminated') && 
        (status === 'failed' || status === 'terminated')) {
      await this.prisma.$transaction(async (tx) => {
        await tx.application.update({ where: { id }, data: { status } });
        await this.entitlementsService.releaseApplicationSlot(app.tenantId, tx);
      });
    } else {
      await this.prisma.application.update({
        where: { id },
        data: { status },
      });
    }
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
