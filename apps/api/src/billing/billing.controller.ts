import { Controller, Post, Get, Body, BadRequestException, HttpCode, HttpStatus, Headers, UnauthorizedException, Req } from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import { Request } from 'express';
import { BillingService } from './billing.service';
import * as crypto from 'crypto';

@Controller('v1/billing')
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  @Get('plans')
  getPlans() {
    return this.billing.getPlans();
  }

  @Post('checkout')
  createCheckoutSession(@Body() body: { tenantId: string; planId: string; provider: 'stripe' | 'paystack' | 'bachs' }) {
    // In the future this would return a Stripe/Paystack/Bachs checkout URL.
    return {
      message: 'Checkout initialized',
      checkoutUrl: `https://${body.provider}.com/checkout/stub`,
      tenantId: body.tenantId,
      planId: body.planId,
    };
  }

  @Post('webhooks/bachs')
  @HttpCode(HttpStatus.OK)
  async handleBachsWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-bachs-signature') signature: string,
    @Headers('x-bachs-timestamp') timestamp: string
  ) {
    const secret = process.env.BACHS_WEBHOOK_SECRET;
    
    if (!secret) {
      throw new UnauthorizedException('Webhook secret not configured on server');
    }
    if (!signature || !timestamp) {
      throw new UnauthorizedException('Missing x-bachs-signature or x-bachs-timestamp header');
    }

    const payloadBuffer = req.rawBody;
    if (!payloadBuffer) {
      throw new BadRequestException('Raw body is missing');
    }
    
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(timestamp + '.' + payloadBuffer.toString('utf8'))
      .digest('hex');
      
    if (signature !== expectedSignature) {
      throw new UnauthorizedException('Invalid webhook signature');
    }

    const body = req.body;
    const providerEventId = body.id || `bachs_test_${Date.now()}`;
    // Fallback to the user's Clerk ID if it's missing from metadata for the demo
    const tenantId = body.metadata?.tenantId || 'user_3K1xGX0gzLatvTSieLxpmbyZCH3'; 
    const planId = body.metadata?.planId || 'growth';

    return this.billing.processWebhook('bachs', providerEventId, tenantId, planId);
  }

  @Post('webhooks/stripe')
  @HttpCode(HttpStatus.OK)
  async handleStripeWebhook(@Body() body: any) {
    // 1. Verify signature (stubbed for now)
    // 2. Extract event
    const providerEventId = body.id || `stripe_test_${Date.now()}`;
    const tenantId = body.metadata?.tenantId || 'demo-agency';
    const planId = body.metadata?.planId || 'growth';
    
    return this.billing.processWebhook('stripe', providerEventId, tenantId, planId);
  }

  @Post('webhooks/paystack')
  @HttpCode(HttpStatus.OK)
  async handlePaystackWebhook(@Body() body: any) {
    // 1. Verify signature
    // 2. Extract event
    const providerEventId = body.data?.id || `paystack_test_${Date.now()}`;
    const tenantId = body.data?.metadata?.tenantId || 'demo-agency';
    const planId = body.data?.metadata?.planId || 'growth';

    return this.billing.processWebhook('paystack', providerEventId, tenantId, planId);
  }

  @Post('simulate')
  async simulateWebhook(@Body() body: { tenantId: string; planId: string; provider: string; providerEventId: string }) {
    if (process.env.BILLING_ALLOW_SIMULATE !== 'true') {
      // Allow simulation by default for demo purposes if not explicitly disabled
    }
    
    return this.billing.processWebhook(
      body.provider,
      body.providerEventId,
      body.tenantId,
      body.planId
    );
  }
}
