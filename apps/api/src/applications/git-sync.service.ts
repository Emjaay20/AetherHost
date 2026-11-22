import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { ApplicationsService } from './applications.service';
import {
  ensureGithubWebhook,
  extractCommitRevisionPrefix,
  fetchLatestCommitSha,
  getGithubToken,
  isFloatingContainerImage,
  isSameGitRevision,
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

  /**
   * Records a revision processed by the webhook or manual deploy path so the
   * background polling interval never triggers a duplicate deployment for it.
   */
  recordDeployedRevision(appId: string, commitSha: string): void {
    const normalized = extractCommitRevisionPrefix(commitSha);
    if (normalized) {
      this.deployedCommitShas.set(appId, normalized);
    }
  }

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

        const persistedRevision =
          (app as { lastDeployedRevision?: string | null }).lastDeployedRevision ||
          extractCommitRevisionPrefix(app.commitMessage);
        const knownSha = this.deployedCommitShas.get(app.id) || persistedRevision;

        // If the persisted database revision already matches the remote SHA (e.g.
        // deployed via GitHub push webhook moments ago), synchronize in-memory
        // state and skip duplicate redeployment.
        if (
          isSameGitRevision(persistedRevision, latest.sha) ||
          isSameGitRevision(knownSha, latest.sha)
        ) {
          this.deployedCommitShas.set(app.id, latest.sha);
          continue;
        }

        if (!knownSha) {
          // Initialize tracking with the current remote commit
          this.deployedCommitShas.set(app.id, latest.sha);
          await this.prisma.application
            .update({
              where: { id: app.id },
              data: { lastDeployedRevision: latest.sha },
            })
            .catch(() => {});
          continue;
        }

        this.logger.log(
          `Auto-sync detected new commit on ${app.githubRepo}: ${latest.sha.slice(0, 7)} - ${latest.message}`,
        );
        this.deployedCommitShas.set(app.id, latest.sha);

        const timeStr = new Date().toTimeString().split(' ')[0];
        if (app.dockerImage && !isFloatingContainerImage(app.dockerImage)) {
          await this.appsService.addLog(
            app.id,
            `[${timeStr}] GitHub commit ${latest.sha.slice(0, 7)} detected, but this deployment is pinned to immutable image "${app.dockerImage}". It was not redeployed with stale code. Update the container image in AetherHost to the new published tag or digest to release this commit.`,
          );
          continue;
        }
        await this.appsService.addLog(
          app.id,
          `[${timeStr}] Auto-sync detected new GitHub commit (${latest.sha.slice(0, 7)}: ${latest.message} by ${latest.author}). Redeploying...`,
        );

        await this.prisma.application.update({
          where: { id: app.id },
          data: {
            commitMessage: `${latest.sha.slice(0, 7)}: ${latest.message}`,
            lastDeployedRevision: latest.sha,
          },
        });

        await this.appsService.redeploy(app.id, app.tenantId);
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
