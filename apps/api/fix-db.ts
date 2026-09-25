import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const result = await prisma.application.deleteMany({
    where: {
      runtime: { notIn: ['wordpress', 'php', 'nodejs', 'python'] }
    }
  });
  console.log(`Deleted ${result.count} invalid apps`);
}
main().catch(console.error).finally(() => prisma.$disconnect());
