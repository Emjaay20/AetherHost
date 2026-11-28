import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { SENSITIVE_FIELDS } from '../src/security/sensitive-fields';

type Row = { model: string; field: string; classification: string };
const valid = new Set(['public', 'internal', 'confidential', 'secret', 'personal']);

export function classifySchema(schema: string): Row[] {
  let model: string | undefined;
  let annotation: string | undefined;
  const rows: Row[] = [];
  for (const line of schema.split(/\r?\n/)) {
    const start = line.match(/^\s*model\s+(\w+)\s*\{/);
    if (start) { model = start[1]; annotation = undefined; continue; }
    if (!model) continue;
    if (/^\s*}/.test(line)) { model = undefined; continue; }
    const tag = line.match(/^\s*\/\/\/\s*@data\(([^)]+)\)\s*$/);
    if (tag) {
      if (annotation) throw new Error(`Multiple classification tags in ${model}`);
      annotation = tag[1];
      continue;
    }
    const field = line.match(/^\s+(\w+)\s+[\w\[\]?]+(?:\s|$)/);
    if (!field) continue;
    if (!annotation || !valid.has(annotation)) throw new Error(`Missing or invalid classification: ${model}.${field[1]}`);
    if (['secret', 'personal'].includes(annotation) && !(SENSITIVE_FIELDS as readonly string[]).includes(field[1])) {
      throw new Error(`Sensitive field missing from SENSITIVE_FIELDS: ${model}.${field[1]}`);
    }
    rows.push({ model, field: field[1], classification: annotation });
    annotation = undefined;
  }
  if (!rows.length) throw new Error('No model fields found');
  return rows;
}

function main() {
  const root = resolve(__dirname, '../../..');
  const rows = classifySchema(readFileSync(resolve(root, 'apps/api/prisma/schema.prisma'), 'utf8'));
  const report = '# Data classification inventory\n\nGenerated from Prisma schema; do not edit by hand.\n\n| Model | Field | Class |\n| --- | --- | --- |\n' + rows.map((row) => `| ${row.model} | ${row.field} | ${row.classification} |`).join('\n') + '\n';
  const reportPath = resolve(root, 'docs/security/data-classification.generated.md');
  if (process.argv.includes('--write')) writeFileSync(reportPath, report);
  else if (readFileSync(reportPath, 'utf8') !== report) throw new Error('Data classification report is stale; run security:classification -- --write');
  console.log(`Validated ${rows.length} model fields.`);
}
if (require.main === module) main();
