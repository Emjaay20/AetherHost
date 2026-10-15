jest.mock('@nestjs/bullmq', () => ({
  InjectQueue: () => () => undefined,
}));

jest.mock('bullmq', () => ({
  Queue: class Queue {},
}));

import * as crypto from 'crypto';
import { BillingController } from '../src/billing/billing.controller';
import { BillingService } from '../src/billing/billing.service';

describe('Billing & Webhook Integration (e2e)', () => {
  let controller: BillingController;
  let webhooksQueue: { add: jest.Mock };

  beforeEach(() => {
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_stripe_secret';
    process.env.PAYSTACK_WEBHOOK_SECRET = 'sk_test_paystack_secret';
    process.env.BACHS_WEBHOOK_SECRET = 'whsec_test_bachs_secret';
    process.env.BILLING_ALLOW_SIMULATE = 'false';

    webhooksQueue = { add: jest.fn().mockResolvedValue({ id: 'job_1' }) };
    const billingService = {
      getPlans: jest.fn(),
      getInvoices: jest.fn(),
    } as unknown as BillingService;

    controller = new BillingController(billingService, webhooksQueue as never);
  });

  it('verifies Stripe webhook signature and queues BullMQ job', async () => {
    const payloadObj = {
      id: 'evt_stripe_1',
      type: 'checkout.session.completed',
      data: {
        object: {
          metadata: { tenantId: 'tenant_1', planId: 'pro' },
        },
      },
    };
    const rawBody = Buffer.from(JSON.stringify(payloadObj));
    const timestamp = Math.floor(Date.now() / 1000);
    const sig = crypto
      .createHmac('sha256', process.env.STRIPE_WEBHOOK_SECRET!)
      .update(`${timestamp}.${rawBody.toString('utf8')}`)
      .digest('hex');

    const res = await controller.handleStripeWebhook(
      { rawBody, body: payloadObj } as never,
      `t=${timestamp},v1=${sig}`,
    );

    expect(res).toEqual({ message: 'Webhook queued successfully' });
    expect(webhooksQueue.add).toHaveBeenCalledWith(
      'process',
      expect.objectContaining({
        provider: 'stripe',
        providerEventId: 'evt_stripe_1',
        tenantId: 'tenant_1',
        planId: 'pro',
        status: 'succeeded',
      }),
      expect.objectContaining({ jobId: 'evt_stripe_1' }),
    );
  });

  it('rejects tampered Stripe webhook signatures', async () => {
    const payloadObj = {
      id: 'evt_stripe_bad',
      type: 'checkout.session.completed',
    };
    const rawBody = Buffer.from(JSON.stringify(payloadObj));
    const timestamp = Math.floor(Date.now() / 1000);

    await expect(
      controller.handleStripeWebhook(
        { rawBody, body: payloadObj } as never,
        `t=${timestamp},v1=deadbeef`,
      ),
    ).rejects.toThrow('Invalid webhook signature');
  });

  it('verifies Bachs webhook signature and queues BullMQ job on collection.succeeded', async () => {
    const payloadObj = {
      id: 'evt_bachs_1',
      type: 'collection.succeeded',
      data: {
        metadata: { tenantId: 'tenant_1', planId: 'pro' },
        amount: 15000,
        currency: 'NGN',
      },
    };
    const rawBody = Buffer.from(JSON.stringify(payloadObj));
    const timestamp = String(Math.floor(Date.now() / 1000));
    const sig = crypto
      .createHmac('sha256', process.env.BACHS_WEBHOOK_SECRET!)
      .update(`${timestamp}.${rawBody.toString('utf8')}`)
      .digest('hex');

    const res = await controller.handleBachsWebhook(
      { rawBody, body: payloadObj } as never,
      sig,
      timestamp,
    );

    expect(res).toEqual({ message: 'Webhook queued successfully' });
    expect(webhooksQueue.add).toHaveBeenCalledWith(
      'process',
      expect.objectContaining({
        provider: 'bachs',
        providerEventId: 'evt_bachs_1',
        tenantId: 'tenant_1',
        planId: 'pro',
        status: 'succeeded',
      }),
      expect.objectContaining({ jobId: 'evt_bachs_1' }),
    );
  });

  it('verifies Bachs webhook on customer.subscription.created', async () => {
    const payloadObj = {
      id: 'evt_bachs_sub',
      type: 'customer.subscription.created',
      data: {
        reference: 'tenant_1:pro',
      },
    };
    const rawBody = Buffer.from(JSON.stringify(payloadObj));
    const timestamp = String(Math.floor(Date.now() / 1000));
    const sig = crypto
      .createHmac('sha256', process.env.BACHS_WEBHOOK_SECRET!)
      .update(`${timestamp}.${rawBody.toString('utf8')}`)
      .digest('hex');

    const res = await controller.handleBachsWebhook(
      { rawBody, body: payloadObj } as never,
      sig,
      timestamp,
    );

    expect(res).toEqual({ message: 'Webhook queued successfully' });
    expect(webhooksQueue.add).toHaveBeenCalledWith(
      'process',
      expect.objectContaining({
        provider: 'bachs',
        providerEventId: 'evt_bachs_sub',
        tenantId: 'tenant_1',
        planId: 'pro',
      }),
      expect.objectContaining({ jobId: 'evt_bachs_sub' }),
    );
  });

  it('rejects tampered Bachs webhook signature', async () => {
    const payloadObj = {
      id: 'evt_bachs_bad',
      type: 'collection.succeeded',
    };
    const rawBody = Buffer.from(JSON.stringify(payloadObj));
    const timestamp = String(Math.floor(Date.now() / 1000));

    await expect(
      controller.handleBachsWebhook(
        { rawBody, body: payloadObj } as never,
        'deadbeef',
        timestamp,
      ),
    ).rejects.toThrow('Invalid webhook signature');
  });

  it('blocks billing simulation when BILLING_ALLOW_SIMULATE is not true', async () => {
    await expect(
      controller.simulateWebhook({
        tenantId: 'tenant_1',
        planId: 'pro',
        provider: 'stripe',
        providerEventId: 'evt_sim_1',
      }),
    ).rejects.toThrow('Billing simulation is disabled');
  });
});
