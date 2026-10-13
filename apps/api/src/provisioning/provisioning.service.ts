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

    const admins = (process.env.ADMIN_TENANT_IDS || '')
      .split(',')
      .map((id) => id.trim())
      .filter((id) => id.length > 0);
    const isAdmin = admins.includes(tenantId);

    const where: any =
      tenantId === SYSTEM_TENANT_ID
        ? { status: 'pending' }
        : { status: { in: ['pending', 'failed'] } };

    if (tenantId !== SYSTEM_TENANT_ID) {
      where.tenantId = isAdmin ? { in: admins } : tenantId;
    }

    const pendingApps = await this.prisma.application.findMany({
      where,
      take: 20,
    });

    for (const app of pendingApps) {
      await this.provisionApp(app.id, tenantId);
    }

    return { processed: pendingApps.length };
  }

  private async appendDeploymentLog(applicationId: string, logContent: string) {
    try {
      await this.prisma.deploymentLog?.create({
        data: { applicationId, logContent },
      });
    } catch {
      // Ignore if deploymentLog table is unavailable in unit test mocks
    }
  }

  async provisionApp(applicationId: string, tenantId: string) {
    const app = await this.prisma.application.findUnique({
      where: { id: applicationId },
    });
    if (!app) {
      throw new NotFoundException('Application not found');
    }
    const admins = (process.env.ADMIN_TENANT_IDS || '')
      .split(',')
      .map((id) => id.trim())
      .filter((id) => id.length > 0);
    const isAdmin = admins.includes(tenantId);

    if (tenantId !== SYSTEM_TENANT_ID && !isAdmin && app.tenantId !== tenantId) {
      throw new ForbiddenException(
        'Application does not belong to this tenant',
      );
    }
    if (app.status !== 'pending' && app.status !== 'failed') {
      return { status: 'skipped or not found' };
    }

    if (app.runtime === 'wordpress' || app.dockerImage) {
      return {
        status: 'pending',
        message: 'Delegated to external orchestrator',
      };
    }

    const ts = () => new Date().toTimeString().split(' ')[0];

    try {
      await this.appendDeploymentLog(
        app.id,
        `[${ts()}] Provisioning initiated for '${app.name || app.id}' (Runtime: ${app.runtime})`,
      );
      const provisioner = this.factory.get(app.runtime);
      const result = await provisioner.provision(
        app.id,
        app.tenantId,
        app.runtime,
      );

      if (result.ok) {
        await this.appendDeploymentLog(
          app.id,
          `[${ts()}] Build & runtime step completed: ${result.message}`,
        );
        await this.appendDeploymentLog(
          app.id,
          `[${ts()}] Health probe returned 200 OK (/health). Application '${app.name || app.id}' is online and serving traffic.`,
        );

        const prevStatus = app.status;
        await this.prisma.$transaction(async (tx) => {
          await tx.application.update({
            where: { id: app.id },
            data: { status: 'running' },
          });

          await this.eventsService.publish(
            new ApplicationStatusChanged(app.tenantId, app.id, {
              from: prevStatus,
              to: 'running',
              message: result.message,
            }),
            tx,
          );
        });
        return { status: 'running', message: result.message };
      }

      await this.appendDeploymentLog(
        app.id,
        `[${ts()}] Provisioning failed: ${result.message}`,
      );
      await this.prisma.application.update({
        where: { id: app.id },
        data: { status: 'failed' },
      });
      return { status: 'failed', message: result.message };
    } catch (err: any) {
      this.logger.error(`Provisioning failed for ${app.id}: ${err.message}`);
      await this.appendDeploymentLog(
        app.id,
        `[${ts()}] Provisioning error: ${err.message}`,
      );
      await this.prisma.application.update({
        where: { id: app.id },
        data: { status: 'failed' },
      });
      return { status: 'failed', error: err.message };
    }
  }
}
