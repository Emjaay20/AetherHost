import {
  Body,
  Controller,
  Headers,
  Logger,
  Optional,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { Prisma } from '@prisma/client';
import { ApplicationsService } from '../applications/applications.service';
import { PrismaService } from '../prisma/prisma.service';
import { verifyGithubSignature } from './github-signature';
import {
  extractCommitRevisionPrefix,
  isFloatingContainerImage,
  isSameGitRevision,
  normalizeRepoFullName,
} from '../applications/github-utils';
import { Public } from '../auth/public.decorator';
import { PreflightSecurityService } from '../security/threat-detection/preflight-security.service';

@Public()
@Controller('v1/webhooks/github')
export class GithubWebhookController {
  private readonly logger = new Logger(GithubWebhookController.name);

  constructor(
    private readonly appsService: ApplicationsService,
    private readonly prisma: PrismaService,
    @Optional() private readonly securityService?: PreflightSecurityService,
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
    } else if (
      process.env.NODE_ENV === 'production' &&
      process.env.ALLOW_UNSIGNED_GITHUB_WEBHOOKS !== 'true'
    ) {
      throw new UnauthorizedException(
        'Unsigned GitHub webhook rejected: GITHUB_WEBHOOK_SECRET is required in production',
      );
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

      if (
        payload.deleted === true ||
        payload.after === '0000000000000000000000000000000000000000'
      ) {
        this.logger.log(`Ignoring branch deletion event for ${targetNormalized}`);
        return { status: 'ignored', reason: 'branch_deleted' };
      }

      const defaultBranch = payload.repository?.default_branch || 'main';
      const branch = payload.ref ? payload.ref.replace('refs/heads/', '') : defaultBranch;
      if (branch !== defaultBranch) {
        this.logger.log(
          `Ignoring push to non-default branch '${branch}' for ${targetNormalized} (default branch is '${defaultBranch}')`,
        );
        return { status: 'ignored', reason: 'non_default_branch' };
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

      const fullCommitSha =
        typeof payload.head_commit?.id === 'string'
          ? payload.head_commit.id.trim()
          : typeof payload.after === 'string'
            ? payload.after.trim()
            : '';
      const commitSha = fullCommitSha ? fullCommitSha.slice(0, 7) : 'latest';
      const commitMsg = payload.head_commit?.message?.split('\n')[0] || `Push to ${branch}`;
      const author = payload.head_commit?.author?.name || payload.pusher?.name || 'GitHub';
      const authorEmail = payload.head_commit?.author?.email || payload.pusher?.email;
      const pusherLogin = payload.pusher?.name || payload.sender?.login;
      const senderId = payload.sender?.id ? String(payload.sender.id) : undefined;

      if (this.securityService) {
        const check = await this.securityService.isIdentityBlocked({
          email: authorEmail,
          githubLogin: pusherLogin,
          githubId: senderId,
          repo: repoFullName,
        });
        if (check.blocked) {
          this.logger.warn(
            `Rejected GitHub push from blocked actor/repo: ${pusherLogin} (${authorEmail}) on ${repoFullName}: ${check.reason}`,
          );
          return { status: 'rejected', reason: 'actor_blocked' };
        }
      }

      // The agent pushes AI-generated files itself while it is already building them;
      // reacting to that push would start a second, racing deployment.
      if (author === 'AetherHost Agent') {
        return { status: 'ignored', reason: 'agent_push' };
      }

      this.logger.log(
        `GitHub push received for ${targetNormalized} on branch ${branch} (${commitSha}: ${commitMsg}). Evaluating ${matchedApps.length} app(s).`,
      );

      let rebuiltCount = 0;
      let skippedDuplicates = 0;

      for (const app of matchedApps) {
        const timeStr = new Date().toTimeString().split(' ')[0];
        if (app.dockerImage && !isFloatingContainerImage(app.dockerImage)) {
          await this.appsService.addLog(
            app.id,
            `[${timeStr}] GitHub push ${commitSha} received, but the deployment image is pinned to immutable reference "${app.dockerImage}". No stale-image redeploy was started. Update the image reference in AetherHost to publish this commit.`,
          );
          continue;
        }

        const existingRevision =
          (app as { lastDeployedRevision?: string | null }).lastDeployedRevision ||
          extractCommitRevisionPrefix(app.commitMessage);
        if (
          fullCommitSha &&
          isSameGitRevision(existingRevision, fullCommitSha) &&
          ['running', 'pending', 'provisioning'].includes(app.status)
        ) {
          skippedDuplicates += 1;
          await this.appsService.addLog(
            app.id,
            `[${timeStr}] GitHub push ${commitSha} skipped: revision ${commitSha} is already ${app.status}.`,
          );
          continue;
        }

        await this.appsService.addLog(
          app.id,
          `[${timeStr}] GitHub push received on branch '${branch}' (${commitSha}: ${commitMsg} by ${author}). Initiating automatic redeployment...`,
        );

        // A human pushed: the repo is now the source of truth. Drop the stored AI
        // snapshot so the agent doesn't overwrite the user's fix with stale files,
        // and persist the target commit revision for deduplication with GitSyncService.
        await this.prisma.application.update({
          where: { id: app.id },
          data: {
            aiFiles: Prisma.DbNull,
            commitMessage: `${commitSha}: ${commitMsg}`,
            ...(fullCommitSha ? { lastDeployedRevision: fullCommitSha } : {}),
          },
        });

        await this.appsService.redeploy(app.id, app.tenantId);
        rebuiltCount += 1;
      }

      return {
        status: rebuiltCount > 0 ? 'rebuilding' : 'deduplicated',
        count: rebuiltCount,
        skippedDuplicates,
        commit: commitSha,
      };
    }

    return { status: 'ignored', event };
  }
}
