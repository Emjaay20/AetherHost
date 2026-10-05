import { ProvisioningService } from './provisioning.service';
import { PrismaService } from '../prisma/prisma.service';
import { DomainEventsService } from '../events/domain-events.service';
import { ProvisionerFactory } from './provisioner.factory';
import { SYSTEM_TENANT_ID } from '../auth/tenant.decorator';

describe('ProvisioningService', () => {
  it('does not mark an image workload running', async () => {
    const prisma = {
      application: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'app_1',
          tenantId: 'tenant-a',
          runtime: 'nodejs',
          status: 'pending',
          dockerImage: 'ghcr.io/acme/signaldesk:1.4.0',
        }),
        update: jest.fn(),
      },
    };
    const service = new ProvisioningService(
      prisma as unknown as PrismaService,
      {} as DomainEventsService,
      {} as ProvisionerFactory,
    );

    await expect(
      service.provisionApp('app_1', SYSTEM_TENANT_ID),
    ).resolves.toEqual({
      status: 'pending',
      message: 'Delegated to external orchestrator',
    });
    expect(prisma.application.update).not.toHaveBeenCalled();
  });

  it('does not mark wordpress running from the Nest stub', async () => {
    const prisma = {
      application: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'app_wp',
          tenantId: 'tenant-a',
          runtime: 'wordpress',
          status: 'pending',
          dockerImage: null,
        }),
        update: jest.fn(),
      },
    };
    const factory = { get: jest.fn() };
    const service = new ProvisioningService(
      prisma as unknown as PrismaService,
      {} as DomainEventsService,
      factory as unknown as ProvisionerFactory,
    );

    await expect(
      service.provisionApp('app_wp', SYSTEM_TENANT_ID),
    ).resolves.toEqual({
      status: 'pending',
      message: 'Delegated to external orchestrator',
    });
    expect(prisma.application.update).not.toHaveBeenCalled();
    expect(factory.get).not.toHaveBeenCalled();
  });
});
