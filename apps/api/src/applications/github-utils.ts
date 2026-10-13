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
