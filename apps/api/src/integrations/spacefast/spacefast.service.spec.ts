import { SpacefastService } from './spacefast.service';

describe('SpacefastService', () => {
  function service(values: Record<string, string | undefined>) {
    return new SpacefastService({
      get: jest.fn((key: string) => values[key]),
    } as any);
  }

  it('reports a disabled integration without making a provider call', () => {
    const status = service({}).getStatus();

    expect(status).toEqual({
      enabled: false,
      configured: false,
      teamIdConfigured: false,
      message: 'Spacefast is disabled.',
    });
    expect(JSON.stringify(status)).not.toContain('sfa_');
  });

  it('reports a configured publisher without returning its credential', () => {
    const status = service({
      SPACEFAST_ENABLED: 'true',
      SPACEFAST_API_KEY: 'sfa_secret_never_returned',
      SPACEFAST_TEAM_ID: 'team_123',
    }).getStatus();

    expect(status).toEqual({
      enabled: true,
      configured: true,
      teamIdConfigured: true,
      message: 'Spacefast is configured. Publishing remains opt-in per external frontend.',
    });
    expect(JSON.stringify(status)).not.toContain('sfa_secret_never_returned');
  });
});
