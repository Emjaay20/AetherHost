import {
  Body,
  Controller,
  Headers,
  Logger,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { ApplicationsService } from '../applications/applications.service';
import { PrismaService } from '../prisma/prisma.service';
import { verifyGithubSignature } from './github-signature';
import { normalizeRepoFullName } from '../applications/github-utils';
import { Public } from '../auth/public.decorator';

@Public()
@Controller('v1/webhooks/github')
export class GithubWebhookController {
  private readonly logger = new Logger(GithubWebhookController.name);

  constructor(
    private readonly appsService: ApplicationsService,
    private readonly prisma: PrismaService,
  ) {}

  @Post()
  async handlePush(
    @Headers('x-github-event') event: string,
    @Headers('x-hub-signature-256') signature: string | undefined,
    @Req() request: Request & { rawBody?: Buffer },
    @Body() payload: any,
  ) {
    const webhookSecret = process.env.GITHUB_WEBHOOK_SECRET;
    if (webhookSecret) {
      if (
        !verifyGithubSignature(
          request.rawBody ?? Buffer.from(''),
          signature,
          webhookSecret,
        )
      ) {
        throw new UnauthorizedException('Invalid GitHub webhook signature');
      }
    }

    if (event === 'ping') {
      this.logger.log('GitHub webhook ping received successfully');
      return { status: 'ok', zen: payload?.zen };
    }

    if (event === 'push') {
      const repoFullName =
        payload.repository?.full_name ||
        payload.repository?.html_url ||
        payload.repository?.clone_url;
      if (!repoFullName) return { status: 'ignored', reason: 'no_repository_in_payload' };

      const targetNormalized = normalizeRepoFullName(repoFullName);
      if (!targetNormalized) {
        return { status: 'ignored', reason: 'invalid_repository_format' };
      }

      // Find all apps with a githubRepo
      const apps = await this.prisma.application.findMany({
        where: { githubRepo: { not: null } },
      });

      const matchedApps = apps.filter((app) => {
        if (!app.githubRepo) return false;
        const appNormalized = normalizeRepoFullName(app.githubRepo);
        return appNormalized === targetNormalized;
      });

      if (matchedApps.length === 0) {
        this.logger.warn(`No application found matching GitHub repository: ${targetNormalized}`);
        return { status: 'ignored', reason: 'no_matching_application' };
      }

      const branch = payload.ref ? payload.ref.replace('refs/heads/', '') : 'main';
      const commitSha = payload.head_commit?.id?.slice(0, 7) || 'latest';
      const commitMsg = payload.head_commit?.message?.split('\n')[0] || `Push to ${branch}`;
      const author = payload.head_commit?.author?.name || payload.pusher?.name || 'GitHub';

      this.logger.log(
        `GitHub push received for ${targetNormalized} on branch ${branch} (${commitSha}: ${commitMsg}). Triggering redeploy for ${matchedApps.length} app(s).`,
      );

      for (const app of matchedApps) {
        const timeStr = new Date().toTimeString().split(' ')[0];
        await this.appsService.addLog(
          app.id,
          `[${timeStr}] GitHub push received on branch '${branch}' (${commitSha}: ${commitMsg} by ${author}). Initiating automatic redeployment...`,
        );

        await this.appsService.redeploy(app.id, app.tenantId);
      }

      return { status: 'rebuilding', count: matchedApps.length, commit: commitSha };
    }

    return { status: 'ignored', event };
  }
}
