import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { ApplicationsService } from './applications.service';
import { EntitlementsService } from '../entitlements/entitlements.service';
import { DomainEventsService } from '../events/domain-events.service';
import { PrismaService } from '../prisma/prisma.service';
import { SYSTEM_TENANT_ID } from '../auth/tenant.decorator';

describe('ApplicationsService', () => {
  let service: ApplicationsService;
  let prisma: {
    application: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
    };
    $transaction: jest.Mock;
  };

  beforeEach(() => {
    prisma = {
      application: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      $transaction: jest.fn(),
    };
    service = new ApplicationsService(
      {} as EntitlementsService,
      {} as DomainEventsService,
      prisma as unknown as PrismaService,
    );
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

  it('rejects delete of a missing application', async () => {
    prisma.application.findUnique.mockResolvedValue(null);
    await expect(
      service.remove('app_missing', 'tenant-a'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
