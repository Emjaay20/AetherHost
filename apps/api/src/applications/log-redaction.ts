import { isSensitiveField } from '../security/sensitive-fields';

/**
 * Deployment logs are operational evidence, not a secret store. Redact common
 * environment and JSON credential forms before they are persisted or shown.
 */
export function redactSensitiveLogContent(input: string): string {
  // Structured log entries can contain nested classified fields. Handle JSON
  // before the fallback patterns, which cannot safely parse nested objects.
  if (/^\s*[\[{]/.test(input)) {
    try {
      const parsed: unknown = JSON.parse(input);
      if (parsed && typeof parsed === 'object') return JSON.stringify(redactAuditMetadata(parsed));
    } catch {
      // Non-JSON log lines still receive best-effort pattern redaction below.
    }
  }
  return input
    .replace(/-----BEGIN (?:[A-Z ]*PRIVATE KEY)-----[\s\S]*?-----END (?:[A-Z ]*PRIVATE KEY)-----/g, '[REDACTED PRIVATE KEY]')
    .replace(/([a-z][a-z0-9+.-]*:\/\/)[^\s/@:]+:[^\s/@]+@/gi, '$1[REDACTED]@')
    .replace(/\b((?:[A-Za-z_][A-Za-z0-9_-]*(?:password|secret|token|api_key)|password|secret|token|api_key))\s*=\s*(["'])[\s\S]*?\2/gi, '$1=[REDACTED]')
    .replace(/\bAuthorization\s*:\s*[^\r\n]+/gi, 'Authorization: [REDACTED]')
    .replace(
      /(^|[\s,{])(["']?)([A-Za-z_][A-Za-z0-9_-]*)\2(\s*[:=]\s*)("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')/g,
      (match, prefix: string, quote: string, key: string, separator: string, value: string) =>
        isSensitiveField(key) ? `${prefix}${quote}${key}${quote}${separator}${value[0]}[REDACTED]${value[0]}` : match,
    )
    .replace(
      /(^|[\s,{])([A-Za-z_][A-Za-z0-9_-]*)(\s*[:=]\s*)([^\s,}\]]+)/g,
      (match, prefix: string, key: string, separator: string) =>
        isSensitiveField(key) ? `${prefix}${key}${separator}[REDACTED]` : match,
    )
    .replace(
      /("(?:api[_-]?key|auth(?:orization)?|credential|pass(?:word)?|secret|token|private[_-]?key)"\s*:\s*")[^"]*(")/gi,
      '$1[REDACTED]$2',
    )
    .replace(/\b(Bearer)\s+[A-Za-z0-9._~+/=-]+/gi, '$1 [REDACTED]');
}

/** Sanitize nested audit metadata before serializing it to the database. */
export function redactAuditMetadata(value: unknown): unknown {
  if (typeof value === 'string') return redactSensitiveLogContent(value);
  if (Array.isArray(value)) return value.map(redactAuditMetadata);
  if (value && typeof value === 'object') {
    // Preserve JSON/Prisma sentinel objects and dates rather than silently
    // changing their semantics while sanitizing ordinary metadata objects.
    if (Object.getPrototypeOf(value) !== Object.prototype) return value;
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [
      key, isSensitiveField(key) ? '[REDACTED]' : redactAuditMetadata(entry),
    ]));
  }
  return value;
}
