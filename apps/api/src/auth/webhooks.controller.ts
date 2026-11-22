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
import { PreflightSecurityService } from '../security/threat-detection/preflight-security.service';

@Public()
@Controller('v1/webhooks/clerk')
export class ClerkWebhookController {
  private readonly logger = new Logger(ClerkWebhookController.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly securityService: PreflightSecurityService,
  ) {}

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
      wh.verify(payload, {
        'svix-id': svixId,
        'svix-timestamp': svixTimestamp,
        'svix-signature': svixSignature,
      });
      evt = JSON.parse(payload) as { type: string; data: any };
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
      const primaryEmail = (email_addresses && email_addresses[0]?.email_address) || undefined;
      const username = evt.data.username || undefined;
      const externalAccounts = evt.data.external_accounts || [];
      const githubAccount = externalAccounts.find((acc: any) => acc.provider === 'oauth_github');
      const githubLogin = githubAccount?.username || username;
      const githubId = githubAccount?.provider_user_id;

      const blockCheck = await this.securityService.isIdentityBlocked({
        email: primaryEmail,
        githubLogin,
        githubId,
        tenantId: id,
      });

      const subscriptionStatus = blockCheck.blocked ? 'suspended' : 'active';
      const name =
        first_name ||
        primaryEmail ||
        'Unknown User';

      if (blockCheck.blocked) {
        this.logger.warn(`Incoming user ${id} (${primaryEmail} / ${githubLogin}) matched blocklist: ${blockCheck.reason}. Provisioning as suspended.`);
      }

      this.logger.log(`Provisioning new tenant for Clerk User: ${id} (status: ${subscriptionStatus})`);

      await this.prisma.tenant.upsert({
        where: { id },
        create: {
          id,
          name,
          planId: 'starter',
          subscriptionStatus,
          entitlements: {
            create: {
              limitApplications: STARTER_ENTITLEMENTS.limits.applications,
              limitAiRequests: STARTER_ENTITLEMENTS.limits.aiRequests,
              limitStorageMb: STARTER_ENTITLEMENTS.limits.storageMb,
              limitBandwidthGb: STARTER_ENTITLEMENTS.limits.bandwidthGb,
            },
          },
        },
        update: {
          name,
          ...(blockCheck.blocked ? { subscriptionStatus: 'suspended' } : {}),
        },
      });

      if (blockCheck.blocked) {
        await this.prisma.auditLog
          .create({
            data: {
              tenantId: id,
              action: 'BLOCKED_IDENTITY_AUTO_SUSPENDED',
              metadata: {
                email: primaryEmail,
                githubLogin,
                reason: blockCheck.reason,
              },
            },
          })
          .catch(() => {});
      }
    }

    return res.status(200).json({ success: true });
  }
}
