import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  BadRequestException,
  HttpCode,
  HttpStatus,
  Headers,
  UnauthorizedException,
  ForbiddenException,
  Req,
  Logger,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import { Request } from 'express';
import { BillingService } from './billing.service';
import { PLANS } from '@aetherhost/domain';
import { Public } from '../auth/public.decorator';
import { TenantId } from '../auth/tenant.decorator';
import {
  verifyBachsSignature,
  verifyPaystackSignature,
  verifyStripeSignature,
} from './webhook-signature';
import { IsIn, IsString } from 'class-validator';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

class CheckoutDto {
  @IsString()
  planId!: string;

  @IsIn(['stripe', 'paystack', 'bachs'])
  provider!: 'stripe' | 'paystack' | 'bachs';
}

class SimulateDto {
  @IsString()
  tenantId!: string;

  @IsString()
  planId!: string;

  @IsString()
  provider!: string;

  @IsString()
  providerEventId!: string;
}

@Controller('v1/billing')
export class BillingController {
  private readonly logger = new Logger(BillingController.name);

  constructor(
    private readonly billing: BillingService,
    @InjectQueue('webhooks') private readonly webhooksQueue: Queue
  ) {}

  @Public()
  @Get('plans')
  getPlans() {
    return this.billing.getPlans();
  }

  @Get('invoices')
  getInvoices(
    @TenantId() tenantId: string,
    @Query('skip') skip?: string,
    @Query('take') take?: string,
  ) {
    return this.billing.getInvoices(
      tenantId,
      skip ? parseInt(skip, 10) : 0,
      take ? parseInt(take, 10) : 10,
    );
  }

  @Post('checkout')
  async createCheckoutSession(
    @TenantId() tenantId: string,
    @Body() body: CheckoutDto,
  ) {
    if (body.provider !== 'bachs') {
      throw new BadRequestException('Only Bachs.io is supported for checkout');
    }

    const baseUrl =
      process.env.BACHS_API_URL ||
      (process.env.BACHS_SECRET_KEY?.startsWith('sk_sandbox_')
        ? 'https://sandbox-api.bachs.io'
        : 'https://api.bachs.io');

    const webhookUrl =
      process.env.BACHS_WEBHOOK_URL ||
      `${process.env.API_BASE_URL || 'http://localhost:3000'}/v1/billing/webhooks/bachs`;

    const productMap: Record<string, string | undefined> = {
      pro: process.env.BACHS_PRO_PRODUCT_ID,
      max: process.env.BACHS_MAX_PRODUCT_ID,
    };
    const productId = productMap[body.planId];

    const payload: Record<string, any> = {
      customer: { email: `${tenantId}@aetherhost.com`, name: tenantId },
      billing_currency: 'NGN',
      payment_method_types: ['NGN_CARD'],
      metadata: {
        tenantId,
        planId: body.planId,
      },
      reference: `${tenantId}:${body.planId}`,
      success_url: `${process.env.FRONTEND_URL || 'https://aetherhost.com.ng'}/billing?success=true`,
      cancel_url: `${process.env.FRONTEND_URL || 'https://aetherhost.com.ng'}/billing?canceled=true`,
      webhook_url: webhookUrl,
    };

    if (productId) {
      payload.product_cart = [
        {
          product_id: productId,
          quantity: 1,
        },
      ];
    } else {
      payload.pricing = {
        amountCent: PLANS[body.planId]?.monthlyPriceCent || 0,
        currency: 'NGN',
        productName: `AetherHost ${body.planId.toUpperCase()} Plan`,
      };
    }

    const res = await fetch(`${baseUrl}/v1/checkout-sessions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.BACHS_SECRET_KEY}`,
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errText = await res.text();
      this.logger.error(`Bachs API Error: ${errText}`);
      throw new BadRequestException(`Failed to generate Bachs checkout. Error: ${errText}`);
    }

    const data = await res.json();
    return {
      message: 'Checkout initialized',
      checkoutUrl: data.checkout_url,
    };
  }

  private async queueWebhook(provider: string, providerEventId: string, tenantId: string, planId: string, action: string = 'process', status: string = 'succeeded') {
    await this.webhooksQueue.add(
      action,
      { provider, providerEventId, tenantId, planId, status },
      { 
        jobId: providerEventId, // BullMQ native deduplication
        attempts: 3, 
        backoff: { type: 'exponential', delay: 1000 } 
      }
    );
    return { message: 'Webhook queued successfully' };
  }

  @Public()
  @Post('webhooks/bachs')
  @HttpCode(HttpStatus.OK)
  async handleBachsWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-bachs-signature') signature: string,
    @Headers('x-bachs-timestamp') timestamp: string,
  ) {
    this.logger.log(`Received Bachs webhook event: ${req.body?.type ?? 'unknown'}`);
    const secret = process.env.BACHS_WEBHOOK_SECRET;
    const payloadBuffer = this.requireRawBody(req);
    if (!secret) throw new UnauthorizedException('Webhook secret not configured on server');
    if (!verifyBachsSignature(payloadBuffer, signature, timestamp, secret)) {
      this.logger.warn('Bachs webhook signature verification failed');
      throw new UnauthorizedException('Invalid webhook signature');
    }

    const body = req.body;
    let action = 'process';
    let status = 'succeeded';
    
    if (
      body.type === 'subscription.canceled' ||
      body.type === 'customer.subscription.deleted'
    ) {
      action = 'cancel';
      status = 'canceled';
    } else if (
      body.type === 'invoice.payment_failed' ||
      body.type === 'collection.failed'
    ) {
      action = 'fail';
      status = 'payment_failed';
    } else if (
      body.type !== 'checkout.completed' &&
      body.type !== 'collection.succeeded' &&
      body.type !== 'customer.subscription.created' &&
      body.type !== 'invoice.paid'
    ) {
      return { message: 'Ignored non-success event' };
    }
    
    const providerEventId = body.id || body.data?.id;
    let tenantId =
      body.data?.metadata?.tenantId ||
      body.data?.customer?.metadata?.tenantId;
    let planId = body.data?.metadata?.planId;

    if (body.data?.reference) {
      const [tId, pId] = body.data.reference.split(':');
      if (tId) tenantId = tId;
      if (pId) planId = pId;
    }

    // Fallback: check product IDs if items array is present
    if (!planId && body.data?.items?.[0]?.product_id) {
      const prodId = body.data.items[0].product_id;
      if (prodId === process.env.BACHS_MAX_PRODUCT_ID) {
        planId = 'max';
      } else if (prodId === process.env.BACHS_PRO_PRODUCT_ID) {
        planId = 'pro';
      }
    }

    planId = planId || 'starter'; // Default to starter if undefined
    this.requireWebhookFields(providerEventId, tenantId, planId);

    return this.queueWebhook('bachs', providerEventId, tenantId, planId, action, status);
  }

  @Public()
  @Post('webhooks/stripe')
  @HttpCode(HttpStatus.OK)
  async handleStripeWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature: string,
  ) {
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    const payloadBuffer = this.requireRawBody(req);
    if (!secret) throw new UnauthorizedException('Webhook secret not configured on server');
    if (!verifyStripeSignature(payloadBuffer, signature, secret)) {
      throw new UnauthorizedException('Invalid webhook signature');
    }

    const body = req.body;
    let action = 'process';
    let status = 'succeeded';
    if (body.type === 'customer.subscription.deleted') {
      action = 'cancel';
      status = 'canceled';
    } else if (body.type === 'invoice.payment_failed') {
      action = 'fail';
      status = 'payment_failed';
    } else if (body.type !== 'checkout.session.completed' && body.type !== 'invoice.payment_succeeded') {
      return { message: 'Ignored non-success event' };
    }
    const providerEventId = body.id;
    const tenantId = body.data?.object?.metadata?.tenantId || body.metadata?.tenantId;
    const planId = body.data?.object?.metadata?.planId || body.metadata?.planId || 'starter';
    this.requireWebhookFields(providerEventId, tenantId, planId);

    return this.queueWebhook('stripe', providerEventId, tenantId, planId, action, status);
  }

  @Public()
  @Post('webhooks/paystack')
  @HttpCode(HttpStatus.OK)
  async handlePaystackWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-paystack-signature') signature: string,
  ) {
    const secret = process.env.PAYSTACK_WEBHOOK_SECRET;
    const payloadBuffer = this.requireRawBody(req);
    if (!secret) throw new UnauthorizedException('Webhook secret not configured on server');
    if (!verifyPaystackSignature(payloadBuffer, signature, secret)) {
      throw new UnauthorizedException('Invalid webhook signature');
    }

    const body = req.body;
    let action = 'process';
    let status = 'succeeded';
    
    if (body.event === 'subscription.disable') {
      action = 'cancel';
      status = 'canceled';
    } else if (body.event === 'invoice.payment_failed' || body.event === 'charge.failed') {
      action = 'fail';
      status = 'payment_failed';
    } else if (body.event !== 'charge.success') {
       return { message: 'Ignored non-success event' };
    }
    const providerEventId = String(body.data?.id ?? '');
    const tenantId = body.data?.metadata?.tenantId;
    const planId = body.data?.metadata?.planId || 'starter';
    this.requireWebhookFields(providerEventId, tenantId, planId);

    return this.queueWebhook('paystack', providerEventId, tenantId, planId, action, status);
  }

  @Public()
  @Post('simulate')
  async simulateWebhook(@Body() body: SimulateDto) {
    if (process.env.BILLING_ALLOW_SIMULATE !== 'true') {
      throw new ForbiddenException('Billing simulation is disabled');
    }

    return this.queueWebhook(
      body.provider,
      body.providerEventId,
      body.tenantId,
      body.planId,
    );
  }

  private requireRawBody(req: RawBodyRequest<Request>): Buffer {
    if (!req.rawBody) {
      throw new BadRequestException('Raw body is missing');
    }
    return req.rawBody;
  }

  private requireWebhookFields(
    providerEventId?: string,
    tenantId?: string,
    planId?: string,
  ) {
    if (!providerEventId || !tenantId || !planId) {
      throw new BadRequestException(
        'Webhook payload missing providerEventId, tenantId, or planId',
      );
    }
  }
}
