const secretKey = /(?:api[_-]?key|auth(?:orization)?|credential|pass(?:word)?|secret|token|private[_-]?key)/i;

/**
 * Deployment logs are operational evidence, not a secret store. Redact common
 * environment and JSON credential forms before they are persisted or shown.
 */
export function redactSensitiveLogContent(input: string): string {
  return input
    .replace(/\bAuthorization\s*:\s*[^\r\n]+/gi, 'Authorization: [REDACTED]')
    .replace(
      /(^|[\s,{])([A-Za-z_][A-Za-z0-9_-]*)(\s*[:=]\s*)([^\s,}\]]+)/g,
      (match, prefix: string, key: string, separator: string) =>
        secretKey.test(key) ? `${prefix}${key}${separator}[REDACTED]` : match,
    )
    .replace(
      /("(?:api[_-]?key|auth(?:orization)?|credential|pass(?:word)?|secret|token|private[_-]?key)"\s*:\s*")[^"]*(")/gi,
      '$1[REDACTED]$2',
    )
    .replace(/\b(Bearer)\s+[A-Za-z0-9._~+/=-]+/gi, '$1 [REDACTED]');
}
