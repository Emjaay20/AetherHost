import {
  Controller,
  Post,
  Body,
  Headers,
  HttpCode,
  HttpStatus,
  Logger,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { createHmac, timingSafeEqual } from 'crypto';
import { CustomerSuccessService } from '../customer-success/customer-success.service';
import { Public } from '../auth/public.decorator';

export interface ChiliPiperWebhookPayload {
  event: 'meeting.booked' | 'meeting.rescheduled' | 'meeting.cancelled';
  id?: string;
  router_name: string;
  assignee: {
    email: string;
    name?: string;
  };
  meeting: {
    id: string;
    start_time: string;
    end_time?: string;
    title?: string;
  };
  lead: {
    email: string;
    first_name?: string;
    last_name?: string;
    company?: string;
    tenant_id?: string;
    [key: string]: any;
  };
}

function verifyChiliPiperSignature(
  rawBody: Buffer,
  signatureHeader: string | undefined,
  secret: string,
): boolean {
  if (!signatureHeader || !secret) return false;
  const normalized = signatureHeader.trim().replace(/^sha256=/i, '');
  const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
  if (normalized.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(normalized), Buffer.from(expected));
}

@Public()
@Controller('v1/webhooks/chilipiper')
export class ChiliPiperWebhookController {
  private readonly logger = new Logger(ChiliPiperWebhookController.name);

  constructor(private readonly csService: CustomerSuccessService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  async handleWebhook(
    @Body() payload: ChiliPiperWebhookPayload,
    @Req() request?: Request & { rawBody?: Buffer },
    @Headers('x-chilipiper-signature') signature?: string,
  ) {
    const secret = process.env.CHILIPIPER_WEBHOOK_SECRET?.trim();
    if (!secret) {
      this.logger.warn(
        '[Chili Piper Webhook Paused] Unverified ingress ignored: CHILIPIPER_WEBHOOK_SECRET is not configured.',
      );
      return {
        received: false,
        status: 'paused_unverified_ingress',
        message: 'Chili Piper webhook ingress is paused until CHILIPIPER_WEBHOOK_SECRET is configured.',
      };
    }

    const rawBody =
      request?.rawBody ?? Buffer.from(JSON.stringify(payload ?? {}));
    if (!verifyChiliPiperSignature(rawBody, signature, secret)) {
      this.logger.warn('[Chili Piper Webhook Rejected] Invalid x-chilipiper-signature.');
      throw new UnauthorizedException('Invalid Chili Piper webhook signature');
    }

    this.logger.log(`[Chili Piper Webhook Ingested] Event: ${payload.event} | Router: ${payload.router_name}`);

    if (payload.event === 'meeting.booked') {
      const result = await this.csService.handleChiliPiperMeetingBooked({
        tenantId: payload.lead?.tenant_id,
        email: payload.lead?.email,
        meetingTime: payload.meeting?.start_time || new Date().toISOString(),
        routerName: payload.router_name || 'inbound-concierge',
        assigneeEmail: payload.assignee?.email || 'csm-emea@aetherhost.io',
      });

      return {
        received: true,
        event: payload.event,
        tenantMatched: result.matched,
        tenantId: result.tenantId,
      };
    }

    return { received: true, event: payload.event };
  }
}
