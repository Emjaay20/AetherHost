import {
  Controller,
  Post,
  Get,
  Body, Query,
  BadRequestException,
  HttpCode,
  HttpStatus,
  Headers,
  UnauthorizedException,
  ForbiddenException,
  Req,
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
  planId: string;

  @IsIn(['stripe', 'paystack', 'bachs'])
  provider: 'stripe' | 'paystack' | 'bachs';
}

class SimulateDto {
  @IsString()
  tenantId: string;

  @IsString()
  planId: string;

  @IsString()
  provider: string;

  @IsString()
  providerEventId: string;
}

@Controller('v1/billing')
export class BillingController {
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

    const res = await fetch('https://api.bachs.io/v1/checkout-sessions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.BACHS_SECRET_KEY}`
      },
      body: JSON.stringify({
        amountCent: PLANS[body.planId]?.monthlyPriceCent || 0,
        currency: 'USD',
        productName: `AetherHost ${body.planId.toUpperCase()} Plan`,
        successUrl: `${process.env.FRONTEND_URL || 'http://localhost:3002'}/billing?success=true`,
        cancelUrl: `${process.env.FRONTEND_URL || 'http://localhost:3002'}/billing?canceled=true`,
        metadata: { tenantId, planId: body.planId }
      })
    });

    if (!res.ok) {
      throw new BadRequestException('Failed to generate Bachs invoice');
    }

    const data = await res.json();
    return {
      message: 'Checkout initialized',
      checkoutUrl: data.checkoutUrl,
      tenantId,
      planId: body.planId,
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
    const secret = process.env.BACHS_WEBHOOK_SECRET;
    const payloadBuffer = this.requireRawBody(req);
    if (!secret) throw new UnauthorizedException('Webhook secret not configured on server');
    if (!verifyBachsSignature(payloadBuffer, signature, timestamp, secret)) {
      throw new UnauthorizedException('Invalid webhook signature');
    }

    const body = req.body;
    let action = 'process';
    let status = 'succeeded';
    
    if (body.type === 'subscription.canceled') {
      action = 'cancel';
      status = 'canceled';
    } else if (body.type === 'invoice.payment_failed') {
      action = 'fail';
      status = 'payment_failed';
    } else if (body.type !== 'checkout.session.completed') {
      return { message: 'Ignored non-success event' };
    }
    
    const providerEventId = body.id;
    const tenantId = body.metadata?.tenantId;
    const planId = body.metadata?.planId || 'starter'; // Default to starter if undefined (e.g. for cancellations)
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
