import { BadRequestException } from '@nestjs/common';
import { BillingService } from './billing.service';
import { PrismaService } from '../prisma/prisma.service';
import { EntitlementsService } from '../entitlements/entitlements.service';
import { DomainEventsService } from '../events/domain-events.service';

describe('BillingService', () => {
  let service: BillingService;
  let prisma: { $transaction: jest.Mock };
  let entitlements: { applyPlan: jest.Mock };
  let events: { publish: jest.Mock };

  beforeEach(() => {
    prisma = {
      $transaction: jest.fn(),
    };
    entitlements = { applyPlan: jest.fn() };
    events = { publish: jest.fn() };
    service = new BillingService(
      prisma as unknown as PrismaService,
      entitlements as unknown as EntitlementsService,
      events as unknown as DomainEventsService,
    );
  });

  it('rejects unknown plans', async () => {
    await expect(
      service.processWebhook('stripe', 'evt_1', 't1', 'enterprise'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('applies a plan once for a new provider event', async () => {
    prisma.$transaction.mockImplementation(async (fn) =>
      fn({
        webhookEvent: { create: jest.fn().mockResolvedValue({}) },
        invoice: { upsert: jest.fn().mockResolvedValue({}) },
        auditLog: { create: jest.fn().mockResolvedValue({}) },
      }),
    );

    await expect(
      service.processWebhook('paystack', 'evt_1', 't1', 'pro'),
    ).resolves.toEqual({
      message: 'Plan applied successfully',
    });
    expect(entitlements.applyPlan).toHaveBeenCalledTimes(1);
    expect(events.publish).toHaveBeenCalledTimes(1);
  });

  it('returns already processed on unique providerEventId conflict', async () => {
    prisma.$transaction.mockRejectedValue({ code: 'P2002' });

    await expect(
      service.processWebhook('paystack', 'evt_1', 't1', 'pro'),
    ).resolves.toEqual({
      message: 'Already processed',
    });
    expect(entitlements.applyPlan).not.toHaveBeenCalled();
  });
});
