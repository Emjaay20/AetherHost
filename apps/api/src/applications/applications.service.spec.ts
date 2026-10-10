import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { ApplicationsService } from './applications.service';
import { EntitlementsService } from '../entitlements/entitlements.service';
import { DomainEventsService } from '../events/domain-events.service';
import { PrismaService } from '../prisma/prisma.service';
import { SYSTEM_TENANT_ID } from '../auth/tenant.decorator';

describe('ApplicationsService', () => {
  let service: ApplicationsService;
  let prisma: {
    tenant: {
      findUnique: jest.Mock;
    };
    application: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
    };
    $transaction: jest.Mock;
  };

  beforeEach(() => {
    prisma = {
      tenant: {
        findUnique: jest.fn(),
      },
      application: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      $transaction: jest.fn((cb: (tx: typeof prisma) => unknown) => cb(prisma)),
    };
    service = new ApplicationsService(
      {} as EntitlementsService,
      {} as DomainEventsService,
      prisma as unknown as PrismaService,
    );
  });

  it('rejects unverified custom domains before provisioning', async () => {
    await expect(
      service.create(
        'tenant-1',
        'example',
        'nodejs',
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        'app.example.com',
      ),
    ).rejects.toThrow(
      'Custom domains require ownership verification before provisioning',
    );
  });

  it('rejects unverified custom domains on update', async () => {
    prisma.application.findUnique.mockResolvedValue({
      id: 'app_1',
      tenantId: 'tenant-1',
    });
    await expect(
      service.updateCustomDomain('app_1', 'tenant-1', 'app.example.com'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.application.update).not.toHaveBeenCalled();
  });

  it('rejects colliding normalized app names before consuming quota', async () => {
    const entitlements = { consumeApplicationSlot: jest.fn() };
    const guarded = new ApplicationsService(
      entitlements as unknown as EntitlementsService,
      {} as DomainEventsService,
      prisma as unknown as PrismaService,
    );
    prisma.tenant.findUnique.mockResolvedValue({
      id: 'tenant-b',
      subscriptionStatus: 'active',
    });
    prisma.application.findMany.mockResolvedValue([{ name: 'My App' }]);

    await expect(
      guarded.create('tenant-b', 'my-app', 'nodejs'),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(entitlements.consumeApplicationSlot).not.toHaveBeenCalled();
  });

  it('scopes listings to the authenticated tenant', async () => {
    prisma.application.findMany.mockResolvedValue([]);
    await service.findAll('pending', undefined, 'tenant-a');
    expect(prisma.application.findMany).toHaveBeenCalledWith({
      where: { status: 'pending', tenantId: 'tenant-a' },
    });
  });

  it('lets the agent list across tenants', async () => {
    prisma.application.findMany.mockResolvedValue([]);
    await service.findAll('pending', undefined, SYSTEM_TENANT_ID);
    expect(prisma.application.findMany).toHaveBeenCalledWith({
      where: { status: 'pending' },
    });
  });

  it("rejects delete of another tenant's application", async () => {
    prisma.application.findUnique.mockResolvedValue({
      id: 'app_1',
      tenantId: 'tenant-b',
    });
    await expect(service.remove('app_1', 'tenant-a')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('rejects a worker without an image before consuming quota', async () => {
    const entitlements = { consumeApplicationSlot: jest.fn() };
    const guarded = new ApplicationsService(
      entitlements as unknown as EntitlementsService,
      {} as DomainEventsService,
      prisma as unknown as PrismaService,
    );
    await expect(
      guarded.create(
        'tenant-a',
        'signaldesk',
        'nodejs' as never,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined, // customDomain
        undefined, // dockerImage
        undefined, // envVars
        'node dist/worker.js', // workerCommand
        true,
        true,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(entitlements.consumeApplicationSlot).not.toHaveBeenCalled();
  });

  it('rejects delete of a missing application', async () => {
    prisma.application.findUnique.mockResolvedValue(null);
    await expect(
      service.remove('app_missing', 'tenant-a'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
