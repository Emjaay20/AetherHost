import { clerkClient } from '@clerk/clerk-sdk-node';

export async function getGithubToken(tenantId: string): Promise<string | null> {
  try {
    const tokens = await clerkClient.users.getUserOauthAccessToken(tenantId, 'oauth_github');
    if (tokens?.data && tokens.data.length > 0) {
      return tokens.data[0].token;
    }
  } catch (err) {
    console.error('Failed to get github token', err);
  }
  return null;
}
