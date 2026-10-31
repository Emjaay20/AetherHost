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

const REPOSITORY_SOURCE_FILE = /(^|\/)(?:Dockerfile(?:\.[^/]+)?|docker-compose(?:\.[^/]+)?\.ya?ml|compose\.ya?ml|package\.json|tsconfig(?:\.[^/]+)?\.json|next\.config\.[^/]+|vite\.config\.[^/]+|README\.md|(?:src|app|pages|public|server|api|lib)\/.*\.(?:[cm]?[jt]sx?|py|go|rs|java|php|rb|css|scss|html|json|ya?ml|toml|env(?:\.example)?))$/i;
const EXCLUDED_REPOSITORY_PATH = /(^|\/)(?:node_modules|\.git|dist|build|coverage|vendor|\.next)\//i;
const MAX_SOURCE_FILES = 60;
const MAX_SOURCE_BYTES = 240_000;

/**
 * Reads a bounded, text-only view of a connected repository for AI edits.
 * The OAuth token stays server-side; source is never sent to the browser.
 */
export async function fetchGithubRepositoryFiles(
  githubRepoUrl: string,
  token: string,
): Promise<{ path: string; content: string }[]> {
  const parsed = parseGithubOwnerRepo(githubRepoUrl);
  if (!parsed) return [];

  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'User-Agent': 'AetherHost-API',
  };

  try {
    const repoResponse = await fetch(
      `https://api.github.com/repos/${parsed.owner}/${parsed.repo}`,
      { headers },
    );
    if (!repoResponse.ok) return [];
    const repository = (await repoResponse.json()) as { default_branch?: string };
    const branch = repository.default_branch || 'main';

    const treeResponse = await fetch(
      `https://api.github.com/repos/${parsed.owner}/${parsed.repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`,
      { headers },
    );
    if (!treeResponse.ok) return [];
    const tree = (await treeResponse.json()) as {
      tree?: Array<{ path?: string; type?: string; sha?: string; size?: number }>;
    };

    const candidates = (tree.tree || [])
      .filter((entry) =>
        entry.type === 'blob' &&
        !!entry.path &&
        !!entry.sha &&
        !EXCLUDED_REPOSITORY_PATH.test(entry.path) &&
        REPOSITORY_SOURCE_FILE.test(entry.path),
      )
      .sort((a, b) => (a.path || '').localeCompare(b.path || ''))
      .slice(0, MAX_SOURCE_FILES);

    const files: { path: string; content: string }[] = [];
    let totalBytes = 0;
    for (const entry of candidates) {
      if (!entry.path || !entry.sha || (entry.size || 0) > 80_000) continue;
      if (totalBytes + (entry.size || 0) > MAX_SOURCE_BYTES) continue;
      const blobResponse = await fetch(
        `https://api.github.com/repos/${parsed.owner}/${parsed.repo}/git/blobs/${entry.sha}`,
        { headers },
      );
      if (!blobResponse.ok) continue;
      const blob = (await blobResponse.json()) as { content?: string; encoding?: string };
      if (!blob.content || blob.encoding !== 'base64') continue;
      const content = Buffer.from(blob.content.replace(/\n/g, ''), 'base64').toString('utf8');
      if (content.includes('\u0000')) continue;
      totalBytes += Buffer.byteLength(content, 'utf8');
      files.push({ path: entry.path, content });
    }
    return files;
  } catch (err) {
    logger.warn(
      `Failed to read source from ${githubRepoUrl}: ${err instanceof Error ? err.message : String(err)}`,
    );
    return [];
  }
}
