import { Injectable, ForbiddenException } from '@nestjs/common';
import { Application, Runtime, ApplicationProvisioningRequested } from '@aetherhost/domain';
import { slugify } from '@aetherhost/common';
import { EntitlementsService } from '../entitlements/entitlements.service';
import { DomainEventsService } from '../events/domain-events.service';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ApplicationsService {
  constructor(
    private readonly entitlementsService: EntitlementsService,
    private readonly eventsService: DomainEventsService,
    private readonly prisma: PrismaService,
  ) {}

  async create(tenantId: string, name: string, runtime: Runtime): Promise<Application> {
    return this.prisma.$transaction(async (tx) => {
      // Ensure tenant exists (since we have a relation, let's create a stub tenant if needed for this demo)
      const existingTenant = await tx.tenant.findUnique({ where: { id: tenantId } });
      if (!existingTenant) {
        await tx.tenant.create({
          data: { id: tenantId, name: tenantId, planId: 'starter' }
        });
      }

      const slotConsumed = await this.entitlementsService.consumeApplicationSlot(tenantId, tx);
      if (!slotConsumed) {
        throw new ForbiddenException('Application limit reached');
      }

      const id = `app_${slugify(name)}_${Math.random().toString(36).substring(2, 7)}`;
      const newApp = await tx.application.create({
        data: {
          id,
          tenantId,
          name,
          runtime,
          status: 'pending',
        }
      });


      await this.eventsService.publish(new ApplicationProvisioningRequested(tenantId, newApp.id), tx);

      return newApp as unknown as Application;
    });
  }

  async findAll(status?: string, runtime?: string, tenantId?: string): Promise<Application[]> {
    const where: any = {};
    if (status) where.status = status;
    if (runtime) where.runtime = runtime;
    if (tenantId && tenantId !== 'SYSTEM') where.tenantId = tenantId;
    
    const apps = await this.prisma.application.findMany({ where });
    return apps as unknown as Application[];
  }

  async remove(id: string): Promise<void> {
    await this.prisma.application.update({
      where: { id },
      data: { status: 'terminating' }
    });
  }

  async hardDelete(id: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const app = await tx.application.findUnique({ where: { id } });
      if (!app) return;

      await tx.application.delete({ where: { id } });
      await this.entitlementsService.releaseApplicationSlot(app.tenantId, tx);
    });
  }
}
