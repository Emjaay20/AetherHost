const { clerkClient } = require('@clerk/clerk-sdk-node');
require('dotenv').config({ path: 'apps/api/.env' });

async function run() {
  try {
    const userId = "user_3Jxd6h5lIR82rBjvdlrZ8uINHGv";
    const tokens = await clerkClient.users.getUserOauthAccessToken(userId, 'oauth_github');
    console.log("Tokens for oauth_github:");
    console.log(tokens);
  } catch (err) {
    console.error(err);
  }
}
run();
