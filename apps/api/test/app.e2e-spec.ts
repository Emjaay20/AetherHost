import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppController } from './../src/app.controller';
import { AppService } from './../src/app.service';
import { HealthController } from './../src/health/health.controller';
import { ApplicationsController } from './../src/applications/applications.controller';
import { ApplicationsService } from './../src/applications/applications.service';
import { BillingController } from './../src/billing/billing.controller';
import { BillingService } from './../src/billing/billing.service';
import { ClerkAuthGuard } from './../src/auth/clerk-auth.guard';

describe('control plane (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [
        AppController,
        HealthController,
        ApplicationsController,
        BillingController,
      ],
      providers: [
        AppService,
        {
          provide: ApplicationsService,
          useValue: { findAll: jest.fn().mockResolvedValue([]) },
        },
        {
          provide: BillingService,
          useValue: {
            processWebhook: jest.fn(),
            getPlans: jest.fn().mockReturnValue([]),
          },
        },
        { provide: APP_GUARD, useClass: ClerkAuthGuard },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });

  it('/ (GET)', () => {
    return request(app.getHttpServer())
      .get('/')
      .expect(200)
      .expect('Hello World!');
  });

  it('/v1/health (GET) is public', () => {
    return request(app.getHttpServer())
      .get('/v1/health')
      .expect(200)
      .expect({ status: 'ok' });
  });

  it('/v1/applications (GET) requires auth', () => {
    return request(app.getHttpServer()).get('/v1/applications').expect(401);
  });

  it('/v1/billing/simulate is disabled unless explicitly enabled', () => {
    delete process.env.BILLING_ALLOW_SIMULATE;
    return request(app.getHttpServer())
      .post('/v1/billing/simulate')
      .send({
        tenantId: 't1',
        planId: 'growth',
        provider: 'paystack',
        providerEventId: 'evt_1',
      })
      .expect(403);
  });

  afterEach(async () => {
    await app.close();
  });
});
