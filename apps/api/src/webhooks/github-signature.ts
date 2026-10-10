import { createHmac, timingSafeEqual } from 'crypto';

export function verifyGithubSignature(
  rawBody: Buffer,
  signature: string | undefined,
  secret: string | undefined,
): boolean {
  if (!secret || !signature || !signature.startsWith('sha256=')) {
    return false;
  }

  const expected = Buffer.from(
    `sha256=${createHmac('sha256', secret).update(rawBody).digest('hex')}`,
    'utf8',
  );
  const provided = Buffer.from(signature, 'utf8');
  return (
    expected.length === provided.length &&
    timingSafeEqual(expected, provided)
  );
}
