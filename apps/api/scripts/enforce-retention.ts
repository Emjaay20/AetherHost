/** Only deployment logs are eligible. Billing, secrets, and audit records are never deleted here. */
import { PrismaClient } from '@prisma/client';

async function main() {
  const days = Number(process.env.DEPLOYMENT_LOG_RETENTION_DAYS);
  if (!Number.isInteger(days) || days < 7 || days > 3650) throw new Error('Set DEPLOYMENT_LOG_RETENTION_DAYS between 7 and 3650');
  const prisma = new PrismaClient();
  const apply = process.argv.includes('--apply');
  const cutoff = new Date(Date.now() - days * 86400000);
  try {
    const where = { createdAt: { lt: cutoff } };
    const eligible = await prisma.deploymentLog.count({ where });
    let deleted = 0;
    if (apply) {
      // Bounded batches avoid a single large delete transaction.
      for (;;) {
        const rows = await prisma.deploymentLog.findMany({ where, take: 500, select: { id: true } });
        if (!rows.length) break;
        deleted += (await prisma.deploymentLog.deleteMany({ where: { ...where, id: { in: rows.map(row => row.id) } } })).count;
      }
    }
    console.log(JSON.stringify({ mode: apply ? 'apply' : 'dry-run', cutoff: cutoff.toISOString(), eligible, deleted }));
  } finally { await prisma.$disconnect(); }
}
main().catch(() => { console.error('Retention execution failed; no data values emitted.'); process.exitCode = 1; });
