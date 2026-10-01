import { EntitlementsService } from './entitlements.service';
import { PrismaService } from '../prisma/prisma.service';

describe('EntitlementsService', () => {
  let service: EntitlementsService;
  let prisma: {
    tenantEntitlement: { findUnique: jest.Mock; create: jest.Mock };
    tenant: { update: jest.Mock };
    $executeRaw: jest.Mock;
  };

  beforeEach(() => {
    prisma = {
      tenantEntitlement: {
        findUnique: jest.fn().mockResolvedValue({
          tenantId: 't1',
          limitApplications: 3,
          usageApplications: 0,
          limitAiRequests: 2,
          usageAiRequests: 0,
          totalAiTokens: 0,
          currentMemoryMb: 0,
        }),
        create: jest.fn(),
      },
      tenant: { update: jest.fn() },
      $executeRaw: jest.fn(),
    };
    service = new EntitlementsService(prisma as unknown as PrismaService);
  });

  it('consumes an application slot only when the atomic update matches one row', async () => {
    prisma.$executeRaw.mockResolvedValue(1);
    await expect(service.consumeApplicationSlot('t1')).resolves.toBe(true);

    prisma.$executeRaw.mockResolvedValue(0);
    await expect(service.consumeApplicationSlot('t1')).resolves.toBe(false);
  });

  it('consumes an AI slot only when the atomic update matches one row', async () => {
    prisma.$executeRaw.mockResolvedValue(1);
    await expect(service.consumeAiRequestSlot('t1', 12)).resolves.toBe(true);

    prisma.$executeRaw.mockResolvedValue(0);
    await expect(service.consumeAiRequestSlot('t1', 12)).resolves.toBe(false);
  });

  it('does not allow AI when usage is at the limit', async () => {
    prisma.tenantEntitlement.findUnique.mockResolvedValue({
      tenantId: 't1',
      limitApplications: 3,
      usageApplications: 0,
      limitAiRequests: 2,
      usageAiRequests: 2,
      totalAiTokens: 0,
      currentMemoryMb: 0,
    });
    await expect(service.canAiRequest('t1')).resolves.toEqual({
      allowed: false,
    });
  });
});
