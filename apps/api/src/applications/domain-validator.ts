import { BadRequestException } from '@nestjs/common';

const DOMAIN_PATTERN =
  /^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,63}$/;

/**
 * Validates and normalizes custom domains (e.g. "my-store.com", "api.sub.example.org").
 * Strips protocol and trailing slashes. Rejects malformed domains and reserved platform domains.
 */
export function validateCustomDomain(
  domain: string | null | undefined,
): string | null {
  if (domain === null || domain === undefined) {
    return null;
  }
  const trimmed = domain.trim();
  if (trimmed === '') {
    return null;
  }

  // Strip leading http(s):// and trailing slashes if user pasted a URL
  const normalized = trimmed
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '');

  if (normalized.length > 253 || !DOMAIN_PATTERN.test(normalized)) {
    throw new BadRequestException(
      `"${domain}" is not a valid domain name (must be a valid FQDN like example.com or app.example.com)`,
    );
  }

  const baseDomain = (
    process.env.BASE_DOMAIN || 'aetherhost.com.ng'
  ).toLowerCase();
  if (
    normalized === baseDomain ||
    normalized.endsWith(`.${baseDomain}`)
  ) {
    throw new BadRequestException(
      `Cannot use "${normalized}" as a custom domain: it is reserved by the platform. Subdomains on ${baseDomain} are assigned automatically.`,
    );
  }

  return normalized;
}
