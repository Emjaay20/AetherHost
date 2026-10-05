import {
  verifyBachsSignature,
  verifyPaystackSignature,
  verifyStripeSignature,
} from './webhook-signature';
import * as crypto from 'crypto';

describe('webhook signatures', () => {
  const rawBody = Buffer.from(
    '{"id":"evt_1","metadata":{"tenantId":"t1","planId":"pro"}}',
  );

  it('accepts a valid Stripe signature and rejects a stale or wrong one', () => {
    const secret = 'whsec_test';
    const timestamp = 1_700_000_000;
    const v1 = crypto
      .createHmac('sha256', secret)
      .update(`${timestamp}.${rawBody.toString('utf8')}`)
      .digest('hex');

    expect(
      verifyStripeSignature(
        rawBody,
        `t=${timestamp},v1=${v1}`,
        secret,
        timestamp,
      ),
    ).toBe(true);
    expect(
      verifyStripeSignature(
        rawBody,
        `t=${timestamp},v1=${v1}`,
        secret,
        timestamp + 301,
      ),
    ).toBe(false);
    expect(
      verifyStripeSignature(
        rawBody,
        `t=${timestamp},v1=${'ab'.repeat(32)}`,
        secret,
        timestamp,
      ),
    ).toBe(false);
    expect(verifyStripeSignature(rawBody, undefined, secret, timestamp)).toBe(
      false,
    );
  });

  it('accepts a valid Paystack signature', () => {
    const secret = 'sk_test';
    const header = crypto
      .createHmac('sha512', secret)
      .update(rawBody)
      .digest('hex');
    expect(verifyPaystackSignature(rawBody, header, secret)).toBe(true);
    expect(verifyPaystackSignature(rawBody, '00'.repeat(64), secret)).toBe(
      false,
    );
  });

  it('accepts a valid Bachs signature', () => {
    const secret = 'bachs_secret';
    const timestamp = '1700000000';
    const signature = crypto
      .createHmac('sha256', secret)
      .update(`${timestamp}.${rawBody.toString('utf8')}`)
      .digest('hex');
    expect(verifyBachsSignature(rawBody, signature, timestamp, secret)).toBe(
      true,
    );
    expect(verifyBachsSignature(rawBody, signature, timestamp, 'other')).toBe(
      false,
    );
  });
});
