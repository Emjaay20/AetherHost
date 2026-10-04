import { EntitlementsService } from './entitlements.service';
import { PrismaService } from '../prisma/prisma.service';

describe('EntitlementsService', () => {
  let service: EntitlementsService;
  let prisma: any;
  let cacheManager: any;
  let appCounter: any;
  let aiCounter: any;

  beforeEach(() => {
    prisma = {
      tenant: {
        findUnique: jest.fn().mockResolvedValue({
          id: 't1',
          planId: 'starter',
          subscriptionStatus: 'active',
          entitlements: {
            tenantId: 't1',
            limitApplications: 3,
            usageApplications: 0,
            limitAiRequests: 2,
            usageAiRequests: 0,
            totalAiTokens: 0,
            currentMemoryMb: 0,
          }
        }),
        create: jest.fn(),
        update: jest.fn(),
      },
      tenantEntitlement: {
        create: jest.fn(),
        findUnique: jest.fn(),
      },
      $executeRaw: jest.fn(),
    };
    
    cacheManager = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue(null),
      del: jest.fn().mockResolvedValue(null),
    };
    
    appCounter = { inc: jest.fn() };
    aiCounter = { inc: jest.fn() };

    service = new EntitlementsService(prisma as any, cacheManager as any, appCounter as any, aiCounter as any);
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
      limitAiRequests: 2,
      usageAiRequests: 2,
    });
    await expect(service.canAiRequest('t1')).resolves.toEqual({
      allowed: false,
    });
  });
});
