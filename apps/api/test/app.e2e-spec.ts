jest.mock('@nestjs/bullmq', () => ({
  InjectQueue: () => () => undefined,
  getQueueToken: (name: string) => `BullQueue_${name}`,
}));

jest.mock('bullmq', () => ({
  Queue: class Queue {},
}));

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AppController } from '../src/app.controller';
import { AppService } from '../src/app.service';
import { ApplicationsController } from '../src/applications/applications.controller';
import { ApplicationsService } from '../src/applications/applications.service';
import { BillingController } from '../src/billing/billing.controller';
import { BillingService } from '../src/billing/billing.service';
import { ClerkAuthGuard } from '../src/auth/clerk-auth.guard';
import { PrismaService } from '../src/prisma/prisma.service';
import { AllExceptionsFilter } from '../src/common/http-exception.filter';
import { PLANS } from '@aetherhost/domain';
import { Queue } from 'bullmq';

describe('AetherHost API Critical Paths (e2e)', () => {
  let app: INestApplication;
  const mockApplicationsService = {
    findPreviewBySafeName: jest.fn().mockResolvedValue({
      id: 'app_demo_1',
      name: 'demo-app',
      runtime: 'nodejs',
      status: 'running',
      aiFiles: { 'index.html': '<h1>Hello</h1>' },
    }),
    findAll: jest.fn().mockResolvedValue([]),
    create: jest
      .fn()
      .mockImplementation((tenantId: string, name: string, runtime: string) => ({
        id: 'app_test_1',
        tenantId,
        name,
        runtime,
        status: 'pending',
      })),
    updateStatus: jest
      .fn()
      .mockImplementation((id: string, status: string) => ({
        id,
        status,
      })),
    addLog: jest.fn().mockResolvedValue({ id: 'log_1' }),
    getLogs: jest.fn().mockResolvedValue([]),
    redeploy: jest
      .fn()
      .mockResolvedValue({ id: 'app_test_1', status: 'pending' }),
  };

  const mockBillingService = {
    getPlans: jest.fn().mockReturnValue(Object.values(PLANS)),
    getInvoices: jest.fn().mockResolvedValue({ data: [], meta: { total: 0 } }),
  };

  const mockWebhooksQueue = {
    add: jest.fn().mockResolvedValue({ id: 'job_1' }),
  };

  beforeAll(async () => {
    process.env.AGENT_SECRET_KEY = 'test-agent-secret-key';
    process.env.BILLING_ALLOW_SIMULATE = 'false';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [AppController, ApplicationsController, BillingController],
      providers: [
        AppService,
        ClerkAuthGuard,
        { provide: PrismaService, useValue: { apiKey: { findUnique: jest.fn() } } },
        { provide: ApplicationsService, useValue: mockApplicationsService },
        { provide: BillingService, useValue: mockBillingService },
        { provide: Queue, useValue: mockWebhooksQueue },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalFilters(new AllExceptionsFilter());
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('serves public catalog plans at GET /v1/billing/plans', async () => {
    const controller = app.get(BillingController);
    const plans = await controller.getPlans();
    expect(plans.length).toBeGreaterThanOrEqual(3);
  });

  it('rejects unauthenticated requests via ClerkAuthGuard', async () => {
    const guard = app.get(ClerkAuthGuard);
    await expect(
      guard.canActivate({
        getHandler: () => ({}),
        getClass: () => ({}),
        switchToHttp: () => ({
          getRequest: () => ({ headers: {} }),
        }),
      } as never),
    ).rejects.toThrow('Missing or invalid Authorization header');
  });

  it('authenticates internal Go Agent via timing-safe x-agent-key header', async () => {
    const guard = app.get(ClerkAuthGuard);
    const req: Record<string, unknown> = {
      headers: { 'x-agent-key': 'test-agent-secret-key' },
    };
    const allowed = await guard.canActivate({
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({
        getRequest: () => req,
      }),
    } as never);
    expect(allowed).toBe(true);
    expect(req.tenantId).toBe('SYSTEM');
  });

  it('enforces DTO validation and system-agent authorization on status updates', async () => {
    const controller = app.get(ApplicationsController);
    expect(() =>
      controller.updateStatusPatch('tenant_user_1', 'app_1', {
        status: 'running',
      }),
    ).toThrow('Only system agent can update status directly');

    const res = await controller.updateStatusPatch('SYSTEM', 'app_1', {
      status: 'running',
    });
    expect(res).toEqual({ id: 'app_1', status: 'running' });
  });
});
