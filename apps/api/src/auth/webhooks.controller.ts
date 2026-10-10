import {
  Controller,
  Post,
  Req,
  Res,
  Headers,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request, Response } from 'express';
import { Webhook } from 'svix';
import { PrismaService } from '../prisma/prisma.service';
import { Public } from './public.decorator';
import { STARTER_ENTITLEMENTS } from '@aetherhost/domain';

@Public()
@Controller('v1/webhooks/clerk')
export class ClerkWebhookController {
  private readonly logger = new Logger(ClerkWebhookController.name);

  constructor(private readonly prisma: PrismaService) {}

  @Post()
  async handleWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Res() res: Response,
    @Headers('svix-id') svixId: string,
    @Headers('svix-timestamp') svixTimestamp: string,
    @Headers('svix-signature') svixSignature: string,
  ) {
    if (!svixId || !svixTimestamp || !svixSignature) {
      throw new BadRequestException('Missing Svix headers');
    }

    const payload = req.rawBody?.toString('utf8');
    const secret = process.env.CLERK_WEBHOOK_SECRET?.trim().replace(
      /['"]/g,
      '',
    );

    if (!secret) {
      this.logger.error('CLERK_WEBHOOK_SECRET is not configured');
      return res
        .status(500)
        .json({ success: false, message: 'Server configuration error' });
    }
    if (!payload) {
      throw new BadRequestException('Raw body is missing');
    }

    const wh = new Webhook(secret);
    let evt: { type: string; data: any };

    try {
      evt = wh.verify(payload, {
        'svix-id': svixId,
        'svix-timestamp': svixTimestamp,
        'svix-signature': svixSignature,
      }) as unknown as { type: string; data: any };
    } catch (err) {
      this.logger.error(
        `Webhook signature verification failed: ${(err as Error).message}`,
      );
      return res
        .status(400)
        .json({ success: false, message: 'Invalid signature' });
    }

    if (evt.type === 'user.created') {
      const { id, first_name, email_addresses } = evt.data;
      const name =
        first_name ||
        (email_addresses && email_addresses[0]?.email_address) ||
        'Unknown User';

      this.logger.log(`Provisioning new tenant for Clerk User: ${id}`);

      await this.prisma.tenant.upsert({
        where: { id },
        create: {
          id,
          name,
          planId: 'starter',
          entitlements: {
            create: {
              limitApplications: STARTER_ENTITLEMENTS.limits.applications,
              limitAiRequests: STARTER_ENTITLEMENTS.limits.aiRequests,
              limitStorageMb: STARTER_ENTITLEMENTS.limits.storageMb,
              limitBandwidthGb: STARTER_ENTITLEMENTS.limits.bandwidthGb,
            },
          },
        },
        update: { name },
      });
    }

    return res.status(200).json({ success: true });
  }
}
