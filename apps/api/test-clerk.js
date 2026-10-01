const { clerkClient } = require('@clerk/clerk-sdk-node');

async function run() {
  try {
    const userId = "user_3Jxd6h5lIR82rBjvdlrZ8uINHGv";
    console.log("Fetching for:", userId);
    const tokens = await clerkClient.users.getUserOauthAccessToken(userId, 'oauth_github');
    console.log("Tokens for oauth_github:");
    console.log(tokens);
  } catch (err) {
    console.error(err);
  }
}
run();
