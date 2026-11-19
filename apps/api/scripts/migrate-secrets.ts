/** Dry-run by default. Rotate/migrate without printing payloads or overwriting concurrent changes. */
import { Prisma, PrismaClient } from '@prisma/client';
import { SecretVaultService } from '../src/common/crypto/secret-vault.service';

async function main() {
  const prisma = new PrismaClient();
  const vault = new SecretVaultService();
  const apply = process.argv.includes('--apply');
  let cursor: string | undefined;
  let inspected = 0, migrated = 0, conflicts = 0;
  try {
    for (;;) {
      const rows = await prisma.application.findMany({
        take: 100, orderBy: { id: 'asc' }, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        select: { id: true, tenantId: true, envVars: true },
      });
      if (!rows.length) break;
      for (const row of rows) {
        inspected++;
        if (row.envVars == null) continue;
        const context = `application:${row.tenantId}:${row.id}`;
        const plaintext = vault.decrypt(row.envVars, context);
        const encrypted = vault.encrypt(plaintext, context);
        if (!apply) continue;
        const result = await prisma.application.updateMany({
          where: { id: row.id, tenantId: row.tenantId, envVars: { equals: row.envVars } },
          data: { envVars: encrypted ? encrypted as unknown as Prisma.InputJsonValue : Prisma.DbNull },
        });
        if (result.count) migrated++; else conflicts++;
      }
      cursor = rows[rows.length - 1].id;
    }
    console.log(JSON.stringify({ mode: apply ? 'apply' : 'dry-run', inspected, migrated, conflicts }));
    if (conflicts) process.exitCode = 1;
  } finally { await prisma.$disconnect(); }
}
main().catch(() => { console.error('Secret migration failed; inspect configuration and protected operational logs. No secret values emitted.'); process.exitCode = 1; });
