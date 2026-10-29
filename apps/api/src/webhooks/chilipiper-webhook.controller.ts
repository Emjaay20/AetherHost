import { Controller, Post, Body, Headers, HttpCode, HttpStatus, Logger } from '@nestjs/common';
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

@Public()
@Controller('v1/webhooks/chilipiper')
export class ChiliPiperWebhookController {
  private readonly logger = new Logger(ChiliPiperWebhookController.name);

  constructor(private readonly csService: CustomerSuccessService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  async handleWebhook(
    @Body() payload: ChiliPiperWebhookPayload,
    @Headers('x-chilipiper-signature') signature?: string
  ) {
    this.logger.log(`[Chili Piper Webhook Ingested] Event: ${payload.event} | Router: ${payload.router_name}`);

    if (payload.event === 'meeting.booked') {
      const result = await this.csService.handleChiliPiperMeetingBooked({
        tenantId: payload.lead?.tenant_id,
        email: payload.lead?.email,
        companyName: payload.lead?.company,
        meetingTime: payload.meeting?.start_time || new Date().toISOString(),
        routerName: payload.router_name || 'inbound-concierge',
        assigneeEmail: payload.assignee?.email || 'csm-emea@aetherhost.io',
      });

      return {
        received: true,
        event: payload.event,
        accountUpdated: result.account?.name,
        healthScore: result.account?.healthScore,
      };
    }

    if (payload.event === 'meeting.cancelled') {
      this.logger.warn(`Chili Piper meeting cancelled for lead: ${payload.lead?.email}`);
      return { received: true, event: payload.event, status: 'meeting_cancelled_recorded' };
    }

    return { received: true, event: payload.event };
  }
}
