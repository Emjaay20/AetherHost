import * as crypto from 'crypto';

function timingSafeEqualHex(left: string, right: string): boolean {
  const a = Buffer.from(left, 'hex');
  const b = Buffer.from(right, 'hex');
  if (a.length === 0 || a.length !== b.length) {
    return false;
  }
  return crypto.timingSafeEqual(a, b);
}

export function verifyStripeSignature(
  rawBody: Buffer,
  header: string | undefined,
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): boolean {
  if (!header) {
    return false;
  }

  const parts = Object.fromEntries(
    header.split(',').map((part) => {
      const [key, ...rest] = part.split('=');
      return [key.trim(), rest.join('=')];
    }),
  );

  const timestamp = parts.t;
  const v1 = parts.v1;
  if (!timestamp || !v1) {
    return false;
  }

  const age = Math.abs(nowSeconds - Number(timestamp));
  if (!Number.isFinite(age) || age > 300) {
    return false;
  }

  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}.${rawBody.toString('utf8')}`)
    .digest('hex');

  return timingSafeEqualHex(v1, expected);
}

export function verifyPaystackSignature(
  rawBody: Buffer,
  header: string | undefined,
  secret: string,
): boolean {
  if (!header) {
    return false;
  }
  const expected = crypto
    .createHmac('sha512', secret)
    .update(rawBody)
    .digest('hex');
  return timingSafeEqualHex(header, expected);
}

export function verifyBachsSignature(
  rawBody: Buffer,
  signature: string | undefined,
  timestamp: string | undefined,
  secret: string,
): boolean {
  if (!signature || !timestamp) {
    return false;
  }
  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}.${rawBody.toString('utf8')}`)
    .digest('hex');
  return timingSafeEqualHex(signature, expected);
}
