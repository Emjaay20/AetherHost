import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { ApplicationsService } from './applications.service';
import {
  ensureGithubWebhook,
  fetchLatestCommitSha,
  getGithubToken,
} from './github-utils';

@Injectable()
export class GitSyncService {
  private readonly logger = new Logger(GitSyncService.name);
  private isChecking = false;
  private readonly deployedCommitShas = new Map<string, string>();
  private readonly lastWebhookCheck = new Map<string, number>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly appsService: ApplicationsService,
  ) {}

  @Interval(30000) // Poll every 30 seconds
  async checkAndSyncRepositories() {
    if (this.isChecking) return;
    this.isChecking = true;

    try {
      // Find all running apps with a githubRepo
      const apps = await this.prisma.application.findMany({
        where: {
          status: 'running',
          githubRepo: { not: null },
        },
      });

      for (const app of apps) {
        if (!app.githubRepo) continue;

        // 1. Periodically ensure webhook is configured (once every 15 minutes)
        const now = Date.now();
        const lastCheck = this.lastWebhookCheck.get(app.id) || 0;
        if (now - lastCheck > 15 * 60 * 1000) {
          this.lastWebhookCheck.set(app.id, now);
          void ensureGithubWebhook(app.tenantId, app.githubRepo);
        }

        // 2. Fetch latest remote commit SHA
        const token = await getGithubToken(app.tenantId);
        const latest = await fetchLatestCommitSha(app.githubRepo, token);
        if (!latest) continue;

        const knownSha = this.deployedCommitShas.get(app.id);

        if (!knownSha) {
          // Initialize tracking with the current remote commit
          this.deployedCommitShas.set(app.id, latest.sha);
          continue;
        }

        if (knownSha !== latest.sha) {
          this.logger.log(
            `Auto-sync detected new commit on ${app.githubRepo}: ${latest.sha.slice(0, 7)} - ${latest.message}`,
          );
          this.deployedCommitShas.set(app.id, latest.sha);

          const timeStr = new Date().toTimeString().split(' ')[0];
          await this.appsService.addLog(
            app.id,
            `[${timeStr}] Auto-sync detected new GitHub commit (${latest.sha.slice(0, 7)}: ${latest.message} by ${latest.author}). Redeploying...`,
          );

          await this.prisma.application.update({
            where: { id: app.id },
            data: {
              commitMessage: `${latest.sha.slice(0, 7)}: ${latest.message}`,
            },
          });

          await this.appsService.redeploy(app.id, app.tenantId);
        }
      }
    } catch (err) {
      this.logger.debug(
        `Error during git auto-sync: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      this.isChecking = false;
    }
  }
}
