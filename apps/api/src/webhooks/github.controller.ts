import { Controller, Post, Body, Headers } from '@nestjs/common';
import { ApplicationsService } from '../applications/applications.service';
import { PrismaService } from '../prisma/prisma.service';
import { DomainEventsService } from '../events/domain-events.service';
import { ApplicationProvisioningRequested } from '@aetherhost/domain';

@Controller('v1/webhooks/github')
export class GithubWebhookController {
  constructor(
    private readonly appsService: ApplicationsService,
    private readonly prisma: PrismaService,
    private readonly eventsService: DomainEventsService,
  ) {}

  @Post()
  async handlePush(@Headers('x-github-event') event: string, @Body() payload: any) {
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
