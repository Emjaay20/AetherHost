import { classifySchema } from '../../scripts/check-data-classification';
import { redactAuditMetadata, redactSensitiveLogContent } from '../applications/log-redaction';

describe('data classification guard', () => {
  it('rejects untagged and unknown fields', () => {
    expect(() => classifySchema('model Example {\n  id String\n}')).toThrow('Missing or invalid');
    expect(() => classifySchema('model Example {\n  /// @data(unknown)\n  id String\n}')).toThrow('Missing or invalid');
  });

  it('rejects secret fields absent from the redaction list', () => {
    expect(() => classifySchema('model Example {\n  /// @data(secret)\n  newCredential String\n}')).toThrow('SENSITIVE_FIELDS');
  });

  it('redacts classified fields in logs and nested audit metadata', () => {
    expect(redactSensitiveLogContent('envVars=example-sensitive-value')).not.toContain('example-sensitive-value');
    expect(redactSensitiveLogContent('name="Example Person"')).not.toContain('Example Person');
    expect(redactSensitiveLogContent('{"envVars":{"PASSWORD":"example-sensitive-value"}}')).not.toContain('example-sensitive-value');
    const value = redactAuditMetadata({ nested: { envVars: { PASSWORD: 'example-sensitive-value' } } });
    expect(JSON.stringify(value)).not.toContain('example-sensitive-value');
    expect(value).toEqual({ nested: { envVars: '[REDACTED]' } });
  });
});
