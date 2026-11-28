/** Field names classified as secret or personal in the Prisma schema. */
export const SENSITIVE_FIELDS = [
  'name', 'envVars', 'keyHash', 'token', 'tokenPayload', 'stateHash',
  'codeVerifierPayload', 'value', 'approvedBy', 'idempotencyKey',
] as const;

const sensitive = new Set<string>(SENSITIVE_FIELDS.map((key) => key.toLowerCase()));
export function isSensitiveField(key: string): boolean {
  return sensitive.has(key.toLowerCase()) || /(?:api[_-]?key|auth(?:orization)?|credential|pass(?:word)?|secret|token|private[_-]?key)/i.test(key);
}
