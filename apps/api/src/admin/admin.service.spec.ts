import { NotFoundException } from '@nestjs/common';
import { AdminService } from './admin.service';

let clerkCalls = 0;
let clerkPage: {
  data: Array<{
    id: string;
    firstName: string | null;
    lastName: string | null;
    emailAddresses: Array<{ emailAddress: string }>;
  }>;
} = { data: [] };

jest.mock('@nestjs/bullmq', () => ({
  InjectQueue: () => () => undefined,
}));

jest.mock('bullmq', () => ({
  Queue: class Queue {},
}));

jest.mock('@clerk/clerk-sdk-node', () => ({
  clerkClient: {
    users: {
      getUserList: () => {
        clerkCalls += 1;
        return Promise.resolve(clerkPage);
      },
    },
  },
}));

type UpsertArg = {
  where: { id: string };
  update: { name: string };
  create: { planId: string };
};

let lastUpsertArg: UpsertArg | undefined;

function rememberUpsert(arg: UpsertArg) {
  lastUpsertArg = arg;
  return Promise.resolve({});
}

describe('AdminService', () => {
  let prisma: {
    tenant: {
      findUnique: jest.Mock;
      findMany: jest.Mock;
      count: jest.Mock;
      upsert: jest.Mock;
    };
    auditLog: { create: jest.Mock };
  };
  let billing: { processWebhook: jest.Mock };
  let entitlements: { applyPlan: jest.Mock };
  let service: AdminService;

  beforeEach(() => {
    clerkCalls = 0;
    clerkPage = { data: [] };
    lastUpsertArg = undefined;
    prisma = {
      tenant: {
        findUnique: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        upsert: jest.fn(rememberUpsert),
        update: jest.fn().mockResolvedValue({}),
      },
      application: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      invoice: {
        update: jest.fn().mockResolvedValue({}),
        create: jest.fn().mockResolvedValue({}),
      },
      webhookEvent: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
      $transaction: jest.fn(async (cb) => cb(prisma)),
    };
    billing = { processWebhook: jest.fn() };
    entitlements = { applyPlan: jest.fn() };
    service = new AdminService(
      prisma as never,
      billing as never,
      entitlements as never,
      { getJobCounts: jest.fn(), getJobs: jest.fn().mockResolvedValue([]) } as never,
    );
  });

  it('does not call Clerk while listing tenants', async () => {
    await service.listTenants({ skip: 0, take: 20 });
    expect(clerkCalls).toBe(0);
    expect(prisma.tenant.findMany).toHaveBeenCalled();
  });

  it('refuses to apply a plan for a missing tenant', async () => {
    prisma.tenant.findUnique.mockResolvedValue(null);
    await expect(
      service.applyOperatorPlan('admin', 'missing', 'pro', 'idemkey01'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(billing.processWebhook).not.toHaveBeenCalled();
  });

  it('reconciles drifted limits without a new invoice', async () => {
    prisma.tenant.findUnique.mockResolvedValue({
      id: 'user_1',
      name: 'Acme',
      planId: 'pro',
      subscriptionStatus: 'active',
      createdAt: new Date(),
      entitlements: {
        limitApplications: 5,
        limitAiRequests: 50,
        limitStorageMb: 2048,
        limitBandwidthGb: 10,
        usageApplications: 0,
        usageAiRequests: 0,
        usageStorageMb: 0,
        usageBandwidthMb: 0,
        usageBandwidthGb: 0,
        totalAiTokens: 0,
      },
    });

    await expect(
      service.applyOperatorPlan('admin', 'user_1', 'pro', 'idemkey01'),
    ).resolves.toEqual({
      message: 'Limits reconciled to catalog',
      planId: 'pro',
      reconciled: true,
    });
    expect(entitlements.applyPlan).toHaveBeenCalledTimes(1);
    expect(billing.processWebhook).not.toHaveBeenCalled();
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: {
        tenantId: 'user_1',
        action: 'ENTITLEMENTS_RECONCILED',
        resourceId: 'pro',
        metadata: {
          actorId: 'admin',
          source: 'operator',
          drift: ['bandwidthGb'],
        },
      },
    });
  });

  it('applies a different plan through the billing webhook path', async () => {
    prisma.tenant.findUnique.mockResolvedValue({
      id: 'user_1',
      name: 'Acme',
      planId: 'starter',
      subscriptionStatus: 'active',
      createdAt: new Date(),
      entitlements: {
        limitApplications: 1,
        limitAiRequests: 10,
        limitStorageMb: 512,
        limitBandwidthGb: 10,
        usageApplications: 0,
        usageAiRequests: 0,
        usageStorageMb: 0,
        usageBandwidthMb: 0,
        usageBandwidthGb: 0,
        totalAiTokens: 0,
      },
    });
    billing.processWebhook.mockResolvedValue({
      message: 'Plan applied successfully',
    });

    await service.applyOperatorPlan('admin_1', 'user_1', 'max', 'idemkey01');

    expect(billing.processWebhook).toHaveBeenCalledWith(
      'operator',
      'operator_idemkey01',
      'user_1',
      'max',
      'succeeded',
      { id: 'admin_1' },
    );
  });

  it('upserts Clerk users without overwriting an existing plan', async () => {
    clerkPage = {
      data: [
        {
          id: 'user_9',
          firstName: 'Ada',
          lastName: 'Lovelace',
          emailAddresses: [{ emailAddress: 'ada@example.com' }],
        },
      ],
    };

    await expect(service.syncDirectory('admin')).resolves.toEqual({
      scanned: 1,
      upserted: 1,
      failed: 0,
      truncated: false,
    });
    expect(lastUpsertArg?.where).toEqual({ id: 'user_9' });
    expect(lastUpsertArg?.update).toEqual({ name: 'Ada Lovelace' });
    expect(lastUpsertArg?.create.planId).toBe('starter');
  });

  it('impersonates a tenant and writes an audit log', async () => {
    prisma.tenant.findUnique.mockResolvedValue({
      id: 'user_1',
      name: 'Acme',
    });

    const result = await service.impersonateTenant('admin_1', 'user_1');
    expect(result.success).toBe(true);
    expect(result.tenantId).toBe('user_1');
    expect(result.tenantName).toBe('Acme');
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: 'user_1',
        action: 'TENANT_IMPERSONATED',
      }),
    });
  });

  it('replays webhooks and logs audit record', async () => {
    prisma.tenant.findUnique.mockResolvedValue({
      id: 'user_1',
      name: 'Acme',
      planId: 'pro',
    });
    prisma.webhookEvent.findMany.mockResolvedValue([
      {
        id: 1,
        provider: 'stripe',
        providerEventId: 'evt_100',
        tenantId: 'user_1',
        planId: 'pro',
        status: 'succeeded',
      },
    ]);
    billing.processWebhook.mockResolvedValue({ message: 'Success' });

    const result = await service.replayWebhooks('admin_1', 'user_1');
    expect(result.success).toBe(true);
    expect(result.count).toBe(1);
    expect(billing.processWebhook).toHaveBeenCalledWith(
      'stripe',
      expect.stringContaining('replay_'),
      'user_1',
      'pro',
      'succeeded',
      { id: 'admin_1' },
    );
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: 'user_1',
        action: 'WEBHOOK_REPLAYED',
      }),
    });
  });

  it('issues a refund for a paid invoice and logs audit record', async () => {
    prisma.tenant.findUnique.mockResolvedValue({
      id: 'user_1',
      name: 'Acme',
      invoices: [
        {
          id: 'inv_uuid',
          invoiceId: 'inv_100',
          amountCent: 2900,
          status: 'paid',
        },
      ],
    });

    const result = await service.issueRefund('admin_1', 'user_1', 29, 'Customer request');
    expect(result.success).toBe(true);
    expect(result.invoiceId).toBe('inv_100');
    expect(result.refundedAmountDollars).toBe(29);
    expect(prisma.invoice.update).toHaveBeenCalledWith({
      where: { id: 'inv_uuid' },
      data: { status: 'refunded' },
    });
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: 'user_1',
        action: 'INVOICE_REFUNDED',
        resourceId: 'inv_100',
      }),
    });
  });

  it('suspends and unsuspends a tenant with workloads transition', async () => {
    prisma.tenant.findUnique.mockResolvedValue({
      id: 'user_1',
      name: 'Acme',
    });

    // Suspend
    const suspendRes = await service.suspendTenant('admin_1', 'user_1', 'TOS Violation');
    expect(suspendRes.success).toBe(true);
    expect(prisma.tenant.update).toHaveBeenCalledWith({
      where: { id: 'user_1' },
      data: { subscriptionStatus: 'suspended' },
    });
    expect(prisma.application.updateMany).toHaveBeenCalledWith({
      where: { tenantId: 'user_1' },
      data: { status: 'suspending' },
    });
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: 'user_1',
        action: 'TENANT_SUSPENDED',
      }),
    });

    // Unsuspend
    const unsuspendRes = await service.unsuspendTenant('admin_1', 'user_1');
    expect(unsuspendRes.success).toBe(true);
    expect(prisma.tenant.update).toHaveBeenCalledWith({
      where: { id: 'user_1' },
      data: { subscriptionStatus: 'active' },
    });
    expect(prisma.application.updateMany).toHaveBeenCalledWith({
      where: { tenantId: 'user_1', status: { in: ['suspended', 'suspending'] } },
      data: { status: 'pending' },
    });
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: 'user_1',
        action: 'TENANT_REACTIVATED',
      }),
    });
  });
});
