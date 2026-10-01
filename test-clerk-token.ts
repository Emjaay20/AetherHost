import { clerkClient } from '@clerk/clerk-sdk-node';
import { config } from 'dotenv';
config({ path: 'apps/api/.env' });

async function run() {
  try {
    const userId = "user_3Jxd6h5lIR82rBjvdlrZ8uINHGv"; // From my previous jq
    const tokens = await clerkClient.users.getUserOauthAccessToken(userId, 'github');
    console.log("Tokens for 'github':", tokens);

    const oldTokens = await clerkClient.users.getUserOauthAccessToken(userId, 'oauth_github');
    console.log("Tokens for 'oauth_github':", oldTokens);
  } catch (err) {
    console.error("Error:", err);
  }
}
run();
