import { Controller, Post, Req, Res, Headers, BadRequestException, Logger } from '@nestjs/common';
import type { Request, Response } from 'express';
import { Webhook } from 'svix';
import { PrismaService } from '../prisma/prisma.service';

@Controller('v1/webhooks/clerk')
export class ClerkWebhookController {
  private readonly logger = new Logger(ClerkWebhookController.name);

  constructor(private readonly prisma: PrismaService) {}

  @Post()
  async handleWebhook(
    @Req() req: Request,
    @Res() res: Response,
    @Headers('svix-id') svixId: string,
    @Headers('svix-timestamp') svixTimestamp: string,
    @Headers('svix-signature') svixSignature: string,
  ) {
    if (!svixId || !svixTimestamp || !svixSignature) {
      throw new BadRequestException('Missing Svix headers');
    }

    // Clerk webhooks send raw JSON
    const payload = JSON.stringify(req.body);
    const secret = process.env.CLERK_WEBHOOK_SECRET?.trim().replace(/['"]/g, '');

    if (!secret) {
      this.logger.error('CLERK_WEBHOOK_SECRET is not configured');
      return res.status(500).json({ success: false, message: 'Server configuration error' });
    }

    const wh = new Webhook(secret);
    let evt: any;

    try {
      wh.verify(payload, {
        'svix-id': svixId,
        'svix-timestamp': svixTimestamp,
        'svix-signature': svixSignature,
      });
      evt = req.body;
    } catch (err) {
      this.logger.error(`Webhook signature verification failed: ${err.message}`);
      return res.status(400).json({ success: false, message: 'Invalid signature' });
    }

    if (evt.type === 'user.created') {
      const { id, first_name, email_addresses } = evt.data;
      const name = first_name || (email_addresses && email_addresses[0]?.email_address) || 'Unknown User';
      
      this.logger.log(`Provisioning new tenant for Clerk User: ${id}`);

      // Auto-provision Tenant + Entitlements
      await this.prisma.tenant.create({
        data: {
          id,
          name,
          planId: 'starter',
          entitlements: {
            create: {
              limitApplications: 3,
              limitAiRequests: 5,
            }
          }
        }
      });
    }

    return res.status(200).json({ success: true });
  }
}
