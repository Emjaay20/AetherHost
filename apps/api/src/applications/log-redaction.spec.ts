import { redactSensitiveLogContent } from './log-redaction';

describe('redactSensitiveLogContent', () => {
  it('redacts environment assignments, JSON values, and bearer credentials', () => {
    const output = redactSensitiveLogContent(
      'DATABASE_PASSWORD=hunter2 {"apiKey":"abc123"} Authorization: Bearer token-value',
    );

    expect(output).toContain('DATABASE_PASSWORD=[REDACTED]');
    expect(output).toContain('"apiKey":"[REDACTED]"');
    expect(output).toContain('Authorization: [REDACTED]');
    expect(output).not.toContain('hunter2');
    expect(output).not.toContain('abc123');
    expect(output).not.toContain('token-value');
  });

  it('leaves ordinary diagnostic text intact', () => {
    expect(redactSensitiveLogContent('Health probe returned HTTP 502')).toBe(
      'Health probe returned HTTP 502',
    );
  });
  it('redacts URL credentials, multiline keys, and quoted assignments', () => {
    const redacted = redactSensitiveLogContent(`postgres://alice:p%40ss@db:5432/app
API_TOKEN="secret with spaces"
-----BEGIN PRIVATE KEY-----
multiline-private-material
-----END PRIVATE KEY-----`);
    expect(redacted).not.toContain('p%40ss');
    expect(redacted).not.toContain('secret with spaces');
    expect(redacted).not.toContain('multiline-private-material');
  });

});
