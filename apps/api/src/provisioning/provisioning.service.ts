import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DomainEventsService } from '../events/domain-events.service';
import { ProvisionerFactory } from './provisioner.factory';
import { ApplicationStatusChanged } from '@aetherhost/domain';

@Injectable()
export class ProvisioningService {
  private readonly logger = new Logger(ProvisioningService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventsService: DomainEventsService,
    private readonly factory: ProvisionerFactory,
  ) {}

  async tick() {
    this.logger.log('Provisioning tick started');
    
    // Find pending applications
    const pendingApps = await this.prisma.application.findMany({
      where: { status: 'pending' },
      take: 10,
    });

    for (const app of pendingApps) {
      await this.provisionApp(app.id);
    }

    return { processed: pendingApps.length };
  }

  async provisionApp(applicationId: string) {
    const app = await this.prisma.application.findUnique({ where: { id: applicationId } });
    if (!app || app.status !== 'pending') {
      return { status: 'skipped or not found' };
    }

    try {
      const provisioner = this.factory.get(app.runtime);
      const result = await provisioner.provision(app.id, app.tenantId, app.runtime);

      if (result.ok) {
        await this.prisma.$transaction(async (tx) => {
          await tx.application.update({
            where: { id: app.id },
            data: { status: 'running' }
          });
          
          await this.eventsService.publish(
            new ApplicationStatusChanged(app.tenantId, app.id, { 
              from: 'pending', 
              to: 'running',
              message: result.message
            }),
            tx
          );
        });
        return { status: 'running', message: result.message };
      }
      
      // If result is not ok, we could transition to FAILED
      await this.prisma.application.update({
        where: { id: app.id },
        data: { status: 'failed' } // Need to ensure status allows 'failed'
      });
      return { status: 'failed', message: result.message };

    } catch (err: any) {
      this.logger.error(`Provisioning failed for ${app.id}: ${err.message}`);
      await this.prisma.application.update({
        where: { id: app.id },
        data: { status: 'failed' } // Or keep pending for retry, but instructions said fail or 400
      });
      return { status: 'failed', error: err.message };
    }
  }
}
