import {
  Injectable,
  Logger,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DomainEventsService } from '../events/domain-events.service';
import { ProvisionerFactory } from './provisioner.factory';
import { ApplicationStatusChanged } from '@aetherhost/domain';
import { SYSTEM_TENANT_ID } from '../auth/tenant.decorator';

@Injectable()
export class ProvisioningService {
  private readonly logger = new Logger(ProvisioningService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventsService: DomainEventsService,
    private readonly factory: ProvisionerFactory,
  ) {}

  async tick(tenantId: string) {
    this.logger.log('Provisioning tick started');

    const where: { status: string; tenantId?: string } = { status: 'pending' };
    if (tenantId !== SYSTEM_TENANT_ID) {
      where.tenantId = tenantId;
    }

    const pendingApps = await this.prisma.application.findMany({
      where,
      take: 10,
    });

    for (const app of pendingApps) {
      await this.provisionApp(app.id, tenantId);
    }

    return { processed: pendingApps.length };
  }

  async provisionApp(applicationId: string, tenantId: string) {
    const app = await this.prisma.application.findUnique({
      where: { id: applicationId },
    });
    if (!app) {
      throw new NotFoundException('Application not found');
    }
    if (tenantId !== SYSTEM_TENANT_ID && app.tenantId !== tenantId) {
      throw new ForbiddenException(
        'Application does not belong to this tenant',
      );
    }
    if (app.status !== 'pending') {
      return { status: 'skipped or not found' };
    }

    // NEW: Delegate docker and github runtimes to the external Go Agent
    if (app.runtime === 'docker' || app.runtime === 'github') {
      return { status: 'pending', message: 'Delegated to external orchestrator' };
    }

    try {
      const provisioner = this.factory.get(app.runtime);
      const result = await provisioner.provision(
        app.id,
        app.tenantId,
        app.runtime,
      );

      if (result.ok) {
        await this.prisma.$transaction(async (tx) => {
          await tx.application.update({
            where: { id: app.id },
            data: { status: 'running' },
          });

          await this.eventsService.publish(
            new ApplicationStatusChanged(app.tenantId, app.id, {
              from: 'pending',
              to: 'running',
              message: result.message,
            }),
            tx,
          );
        });
        return { status: 'running', message: result.message };
      }

      await this.prisma.application.update({
        where: { id: app.id },
        data: { status: 'failed' },
      });
      return { status: 'failed', message: result.message };
    } catch (err: any) {
      this.logger.error(`Provisioning failed for ${app.id}: ${err.message}`);
      await this.prisma.application.update({
        where: { id: app.id },
        data: { status: 'failed' },
      });
      return { status: 'failed', error: err.message };
    }
  }
}
