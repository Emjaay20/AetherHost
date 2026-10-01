import {
  Controller,
  Post,
  Get,
  Body,
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
import { Public } from '../auth/public.decorator';
import { TenantId } from '../auth/tenant.decorator';
import {
  verifyBachsSignature,
  verifyPaystackSignature,
  verifyStripeSignature,
} from './webhook-signature';
import { IsIn, IsString } from 'class-validator';

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
  constructor(private readonly billing: BillingService) {}

  @Public()
  @Get('plans')
  getPlans() {
    return this.billing.getPlans();
  }

  @Post('checkout')
  createCheckoutSession(
    @TenantId() tenantId: string,
    @Body() body: CheckoutDto,
  ) {
    return {
      message: 'Checkout initialized',
      checkoutUrl: `https://${body.provider}.com/checkout/stub`,
      tenantId,
      planId: body.planId,
    };
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
    if (!secret) {
      throw new UnauthorizedException(
        'Webhook secret not configured on server',
      );
    }
    if (!verifyBachsSignature(payloadBuffer, signature, timestamp, secret)) {
      throw new UnauthorizedException('Invalid webhook signature');
    }

    const body = req.body;
    const providerEventId = body.id;
    const tenantId = body.metadata?.tenantId;
    const planId = body.metadata?.planId;
    this.requireWebhookFields(providerEventId, tenantId, planId);

    return this.billing.processWebhook(
      'bachs',
      providerEventId,
      tenantId,
      planId,
    );
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
    if (!secret) {
      throw new UnauthorizedException(
        'Webhook secret not configured on server',
      );
    }
    if (!verifyStripeSignature(payloadBuffer, signature, secret)) {
      throw new UnauthorizedException('Invalid webhook signature');
    }

    const body = req.body;
    const providerEventId = body.id;
    const tenantId =
      body.data?.object?.metadata?.tenantId || body.metadata?.tenantId;
    const planId = body.data?.object?.metadata?.planId || body.metadata?.planId;
    this.requireWebhookFields(providerEventId, tenantId, planId);

    return this.billing.processWebhook(
      'stripe',
      providerEventId,
      tenantId,
      planId,
    );
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
    if (!secret) {
      throw new UnauthorizedException(
        'Webhook secret not configured on server',
      );
    }
    if (!verifyPaystackSignature(payloadBuffer, signature, secret)) {
      throw new UnauthorizedException('Invalid webhook signature');
    }

    const body = req.body;
    const providerEventId = String(body.data?.id ?? '');
    const tenantId = body.data?.metadata?.tenantId;
    const planId = body.data?.metadata?.planId;
    this.requireWebhookFields(providerEventId, tenantId, planId);

    return this.billing.processWebhook(
      'paystack',
      providerEventId,
      tenantId,
      planId,
    );
  }

  @Public()
  @Post('simulate')
  async simulateWebhook(@Body() body: SimulateDto) {
    if (process.env.BILLING_ALLOW_SIMULATE !== 'true') {
      throw new ForbiddenException('Billing simulation is disabled');
    }

    return this.billing.processWebhook(
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
