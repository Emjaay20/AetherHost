import { Logger } from '@nestjs/common';
import { clerkClient } from '@clerk/clerk-sdk-node';

const logger = new Logger('GitHubUtils');

export async function getGithubToken(tenantId: string): Promise<string | null> {
  try {
    const tokens = await clerkClient.users.getUserOauthAccessToken(tenantId, 'oauth_github');
    if (tokens?.data && tokens.data.length > 0) {
      return tokens.data[0].token;
    }
  } catch (err) {
    logger.warn(
      `Failed to get github token for tenant ${tenantId}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  return null;
}

export function parseGithubOwnerRepo(urlOrName?: string | null): { owner: string; repo: string } | null {
  if (!urlOrName) return null;
  const cleaned = urlOrName.trim().replace(/\.git$/, '').replace(/\/+$/, '');
  const match = cleaned.match(/(?:github\.com[:/]|git@github\.com:)?([^/\s]+)\/([^/\s]+)$/i);
  if (!match) return null;
  return { owner: match[1], repo: match[2] };
}

export function normalizeRepoFullName(urlOrName?: string | null): string | null {
  const parsed = parseGithubOwnerRepo(urlOrName);
  if (!parsed) return null;
  return `${parsed.owner.toLowerCase()}/${parsed.repo.toLowerCase()}`;
}

export async function ensureGithubWebhook(
  tenantId: string,
  githubRepoUrl: string,
): Promise<boolean> {
  const parsed = parseGithubOwnerRepo(githubRepoUrl);
  if (!parsed) return false;

  const token = await getGithubToken(tenantId);
  if (!token) return false;

  const baseDomain = process.env.BASE_DOMAIN || 'aetherhost.com.ng';
  const webhookUrl =
    process.env.GITHUB_WEBHOOK_URL ||
    (process.env.API_BASE_URL
      ? `${process.env.API_BASE_URL}/v1/webhooks/github`
      : `https://api.${baseDomain}/v1/webhooks/github`);

  const secret = process.env.GITHUB_WEBHOOK_SECRET;

  try {
    // 1. Check existing webhooks on repository
    const listRes = await fetch(
      `https://api.github.com/repos/${parsed.owner}/${parsed.repo}/hooks`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          'User-Agent': 'AetherHost-API',
        },
      },
    );

    if (listRes.status === 200) {
      const hooks = (await listRes.json()) as Array<{ config?: { url?: string } }>;
      const alreadyInstalled = hooks.some(
        (h) => h.config?.url?.toLowerCase() === webhookUrl.toLowerCase(),
      );
      if (alreadyInstalled) {
        logger.debug(
          `GitHub webhook already registered on ${parsed.owner}/${parsed.repo}`,
        );
        return true;
      }
    }

    // 2. Register webhook
    const createRes = await fetch(
      `https://api.github.com/repos/${parsed.owner}/${parsed.repo}/hooks`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          'Content-Type': 'application/json',
          'User-Agent': 'AetherHost-API',
        },
        body: JSON.stringify({
          name: 'web',
          active: true,
          events: ['push'],
          config: {
            url: webhookUrl,
            content_type: 'json',
            ...(secret ? { secret } : {}),
            insecure_ssl: '0',
          },
        }),
      },
    );

    if (createRes.status === 201) {
      logger.log(
        `Successfully registered GitHub push webhook on ${parsed.owner}/${parsed.repo} -> ${webhookUrl}`,
      );
      return true;
    } else if (createRes.status === 422) {
      logger.debug(
        `Webhook hook configuration already exists on ${parsed.owner}/${parsed.repo}`,
      );
      return true;
    } else {
      const errText = await createRes.text();
      logger.warn(
        `GitHub webhook creation returned ${createRes.status} for ${parsed.owner}/${parsed.repo}: ${errText}`,
      );
      return false;
    }
  } catch (err) {
    logger.warn(
      `Failed to ensure GitHub webhook for ${parsed.owner}/${parsed.repo}: ${err instanceof Error ? err.message : String(err)}`,
    );
    return false;
  }
}

export async function fetchLatestCommitSha(
  githubRepoUrl: string,
  token?: string | null,
): Promise<{ sha: string; message: string; author: string } | null> {
  const parsed = parseGithubOwnerRepo(githubRepoUrl);
  if (!parsed) return null;

  try {
    const headers: Record<string, string> = {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'AetherHost-API',
    };
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const res = await fetch(
      `https://api.github.com/repos/${parsed.owner}/${parsed.repo}/commits?per_page=1`,
      { headers },
    );
    if (!res.ok) return null;
    const commits = (await res.json()) as Array<{
      sha: string;
      commit?: { message?: string; author?: { name?: string } };
    }>;
    if (!Array.isArray(commits) || commits.length === 0) return null;

    const latest = commits[0];
    return {
      sha: latest.sha,
      message: latest.commit?.message?.split('\n')[0] || '',
      author: latest.commit?.author?.name || 'Unknown',
    };
  } catch (err) {
    logger.debug(
      `Failed to fetch latest commit for ${githubRepoUrl}: ${err instanceof Error ? err.message : String(err)}`,
    );
    return null;
  }
}
