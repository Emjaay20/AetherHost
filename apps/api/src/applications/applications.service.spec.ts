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
      { publish: jest.fn().mockResolvedValue(undefined) } as unknown as DomainEventsService,
      prisma as unknown as PrismaService,
    );
  });

  it('rejects invalid custom domains before provisioning', async () => {
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
        'not a domain',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('accepts and normalizes valid custom domains on update', async () => {
    prisma.application.findUnique.mockResolvedValue({
      id: 'app_1',
      tenantId: 'tenant-1',
    });
    prisma.application.findFirst = jest.fn().mockResolvedValue(null);
    prisma.application.update.mockResolvedValue({
      id: 'app_1',
      customDomain: 'app.example.com',
    });

    const res = await service.updateCustomDomain('app_1', 'tenant-1', 'https://App.Example.com/');
    expect(res).toEqual({ success: true, customDomain: 'app.example.com' });
    expect(prisma.application.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'app_1' },
        data: expect.objectContaining({ customDomain: 'app.example.com' }),
      }),
    );
  });

  it('rejects colliding custom domains on update', async () => {
    prisma.application.findUnique.mockResolvedValue({
      id: 'app_1',
      tenantId: 'tenant-1',
    });
    prisma.application.findFirst = jest.fn().mockResolvedValue({
      id: 'app_other',
      customDomain: 'app.example.com',
    });

    await expect(
      service.updateCustomDomain('app_1', 'tenant-1', 'app.example.com'),
    ).rejects.toBeInstanceOf(ConflictException);
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
      orderBy: { createdAt: 'desc' },
    });
  });

  it('lets the agent list across tenants', async () => {
    prisma.application.findMany.mockResolvedValue([]);
    await service.findAll('pending', undefined, SYSTEM_TENANT_ID);
    expect(prisma.application.findMany).toHaveBeenCalledWith({
      where: { status: 'pending' },
      orderBy: { createdAt: 'desc' },
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

  it('rejects an invalid container image on updateDockerImage', async () => {
    prisma.application.findUnique.mockResolvedValue({
      id: 'app_1',
      tenantId: 'tenant-a',
      runtime: 'docker',
      status: 'running',
    });

    await expect(
      service.updateDockerImage('app_1', 'tenant-a', 'invalid/../image:latest'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('updates container image and triggers provisioning event', async () => {
    const publishMock = jest.fn().mockResolvedValue(undefined);
    const domainEvents = { publish: publishMock } as unknown as DomainEventsService;
    const testPrisma = {
      ...prisma,
      deploymentLog: { create: jest.fn().mockResolvedValue({}) },
      application: {
        ...prisma.application,
        findUnique: jest.fn().mockResolvedValue({
          id: 'app_1',
          tenantId: 'tenant-a',
          runtime: 'docker',
          status: 'running',
        }),
        update: jest.fn().mockResolvedValue({
          id: 'app_1',
          dockerImage: 'ghcr.io/org/app:v2.0.0',
          status: 'pending',
        }),
      },
    };

    const s = new ApplicationsService(
      {} as EntitlementsService,
      domainEvents,
      testPrisma as unknown as PrismaService,
    );

    const result = await s.updateDockerImage('app_1', 'tenant-a', 'ghcr.io/org/app:v2.0.0', true);

    expect(result.success).toBe(true);
    expect(result.dockerImage).toBe('ghcr.io/org/app:v2.0.0');
    expect(result.status).toBe('pending');
    expect(testPrisma.application.update).toHaveBeenCalledWith({
      where: { id: 'app_1' },
      data: { dockerImage: 'ghcr.io/org/app:v2.0.0', status: 'pending' },
    });
    expect(publishMock).toHaveBeenCalled();
  });
});
