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
    const auditCreate = jest.fn().mockResolvedValue({});
    const tenantUpdate = jest.fn().mockResolvedValue({});
    prisma.$transaction.mockImplementation(async (fn) =>
      fn({
        webhookEvent: { create: jest.fn().mockResolvedValue({}) },
        invoice: { upsert: jest.fn().mockResolvedValue({}) },
        auditLog: { create: auditCreate },
        tenant: { update: tenantUpdate },
      }),
    );

    await expect(
      service.processWebhook('paystack', 'evt_1', 't1', 'pro'),
    ).resolves.toEqual({
      message: 'Plan applied successfully',
    });
    expect(entitlements.applyPlan).toHaveBeenCalledTimes(1);
    expect(events.publish).toHaveBeenCalledTimes(1);
    expect(tenantUpdate).toHaveBeenCalledWith({
      where: { id: 't1' },
      data: { subscriptionStatus: 'active' },
    });
  });

  it('records the operator on the audit row', async () => {
    const auditCreate = jest.fn().mockResolvedValue({});
    prisma.$transaction.mockImplementation(async (fn) =>
      fn({
        webhookEvent: { create: jest.fn().mockResolvedValue({}) },
        invoice: { upsert: jest.fn().mockResolvedValue({}) },
        auditLog: { create: auditCreate },
        tenant: { update: jest.fn().mockResolvedValue({}) },
      }),
    );

    await service.processWebhook('operator', 'op_1', 't1', 'pro', 'succeeded', {
      id: 'admin_1',
    });

    expect(auditCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'PLAN_UPGRADED',
        metadata: expect.objectContaining({
          actorId: 'admin_1',
          source: 'operator',
          provider: 'operator',
        }),
      }),
    });
  });

  it('marks payment failure as past_due and downgrades to starter', async () => {
    const tenantUpdate = jest.fn().mockResolvedValue({});
    prisma.$transaction.mockImplementation(async (fn) =>
      fn({
        webhookEvent: { create: jest.fn().mockResolvedValue({}) },
        invoice: { upsert: jest.fn().mockResolvedValue({}) },
        auditLog: { create: jest.fn().mockResolvedValue({}) },
        application: { updateMany: jest.fn().mockResolvedValue({}) },
        tenant: { update: tenantUpdate },
      }),
    );

    await expect(
      service.processWebhook('paystack', 'evt_fail', 't1', 'pro', 'payment_failed'),
    ).resolves.toEqual({ message: 'Payment failed, dunning applied' });
    expect(entitlements.applyPlan).toHaveBeenCalledWith(
      't1',
      expect.objectContaining({ id: 'starter' }),
      expect.anything(),
    );
    expect(tenantUpdate).toHaveBeenCalledWith({
      where: { id: 't1' },
      data: { subscriptionStatus: 'past_due' },
    });
    expect(events.publish).not.toHaveBeenCalled();
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
