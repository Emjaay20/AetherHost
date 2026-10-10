import {
  Body,
  Controller,
  Headers,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { ApplicationsService } from '../applications/applications.service';
import { PrismaService } from '../prisma/prisma.service';
import { DomainEventsService } from '../events/domain-events.service';
import { ApplicationProvisioningRequested } from '@aetherhost/domain';
import { verifyGithubSignature } from './github-signature';

@Controller('v1/webhooks/github')
export class GithubWebhookController {
  constructor(
    private readonly appsService: ApplicationsService,
    private readonly prisma: PrismaService,
    private readonly eventsService: DomainEventsService,
  ) {}

  @Post()
  async handlePush(
    @Headers('x-github-event') event: string,
    @Headers('x-hub-signature-256') signature: string | undefined,
    @Req() request: Request & { rawBody?: Buffer },
    @Body() payload: any,
  ) {
    if (
      !verifyGithubSignature(
        request.rawBody ?? Buffer.from(''),
        signature,
        process.env.GITHUB_WEBHOOK_SECRET,
      )
    ) {
      throw new UnauthorizedException('Invalid GitHub webhook signature');
    }

    if (event === 'push') {
      const repoUrl = payload.repository?.html_url || payload.repository?.clone_url;
      if (!repoUrl) return { status: 'ignored' };

      // Find apps with this repo
      const apps = await this.prisma.application.findMany({
        where: { githubRepo: repoUrl }
      });

      for (const app of apps) {
        // Reset status to pending so agent picks it up and rebuilds
        await this.appsService.updateStatus(app.id, 'pending');
        
        await this.eventsService.publish(
          new ApplicationProvisioningRequested(app.tenantId, app.id),
          this.prisma,
        );
      }
      return { status: 'rebuilding', count: apps.length };
    }
    return { status: 'ignored' };
  }
}
