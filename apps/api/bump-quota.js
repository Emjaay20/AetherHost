const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  await prisma.tenantEntitlement.updateMany({
    data: {
      limitAiRequests: 100,
      usageAiRequests: 0,
    }
  });
  console.log("All tenants upgraded to 100 AI requests!");
}
run();
