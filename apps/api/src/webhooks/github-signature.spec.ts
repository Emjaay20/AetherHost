import { createHmac } from 'crypto';
import { verifyGithubSignature } from './github-signature';

describe('GitHub webhook signatures', () => {
  it('accepts a valid signature and rejects altered requests', () => {
    const rawBody = Buffer.from('{"ref":"refs/heads/main"}');
    const secret = 'github-webhook-secret';
    const digest = createHmac('sha256', secret).update(rawBody).digest('hex');

    expect(verifyGithubSignature(rawBody, `sha256=${digest}`, secret)).toBe(
      true,
    );
    expect(
      verifyGithubSignature(
        Buffer.from('{"ref":"refs/heads/other"}'),
        `sha256=${digest}`,
        secret,
      ),
    ).toBe(false);
    expect(verifyGithubSignature(rawBody, undefined, secret)).toBe(false);
  });
});
