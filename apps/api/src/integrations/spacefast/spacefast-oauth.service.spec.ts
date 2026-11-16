jest.mock('@nestjs/config', () => ({ ConfigService: class ConfigService {} }));

import { SpacefastOAuthService } from './spacefast-oauth.service';

describe('SpacefastOAuthService', () => {
  const originalFetch = global.fetch;
  const config = (values: Record<string, string | undefined>) => ({ get: jest.fn((key: string) => values[key]) });
  const vault = {
    encrypt: jest.fn((value: Record<string, string>) => ({ __encrypted: true, version: 1, iv: 'iv', tag: 'tag', ciphertext: Buffer.from(JSON.stringify(value)).toString('base64') })),
    decrypt: jest.fn((payload: { ciphertext: string }) => JSON.parse(Buffer.from(payload.ciphertext, 'base64').toString('utf8'))),
  };

  function prisma(overrides: Record<string, unknown> = {}) {
    return {
      externalProviderConnection: { findUnique: jest.fn().mockResolvedValue(null), upsert: jest.fn(), update: jest.fn(), delete: jest.fn() },
      externalProviderOAuthState: { deleteMany: jest.fn(), create: jest.fn(), findUnique: jest.fn(), delete: jest.fn() },
      auditLog: { create: jest.fn() },
      ...overrides,
    };
  }

  afterEach(() => { global.fetch = originalFetch; jest.clearAllMocks(); });

  it('keeps customer-owned connections disabled until all OAuth configuration is supplied', async () => {
    const db = prisma();
    const service = new SpacefastOAuthService(db as any, vault as any, config({}) as any);
    await expect(service.status('tenant_1')).resolves.toMatchObject({ configured: false, connected: false });
    await expect(service.begin('tenant_1')).rejects.toThrow('not configured');
    expect(db.externalProviderOAuthState.create).not.toHaveBeenCalled();
  });

  it('starts authorization-code OAuth with PKCE and stores only a hashed state plus encrypted verifier', async () => {
    const db = prisma();
    const service = new SpacefastOAuthService(db as any, vault as any, config({
      SPACEFAST_OAUTH_CLIENT_ID: 'client_1', SPACEFAST_OAUTH_CLIENT_SECRET: 'secret_1', SPACEFAST_OAUTH_REDIRECT_URI: 'https://api.example.com/v1/integrations/spacefast/oauth/callback', SPACEFAST_OAUTH_SUCCESS_REDIRECT: 'https://console.example.com/console',
    }) as any);
    const { authorizationUrl } = await service.begin('tenant_1');
    const url = new URL(authorizationUrl);
    expect(url.origin).toBe('https://api.spacefast.com');
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('scope')).toContain('offline_access');
    expect(db.externalProviderOAuthState.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ tenantId: 'tenant_1', stateHash: expect.any(String), codeVerifierPayload: expect.objectContaining({ __encrypted: true }) }) }));
    const stored = db.externalProviderOAuthState.create.mock.calls[0][0].data;
    expect(stored.stateHash).not.toBe(url.searchParams.get('state'));
    expect(JSON.stringify(stored)).not.toContain(url.searchParams.get('code_challenge')!);
  });

  it('exchanges a verified callback, encrypts tokens, and selects the only available team', async () => {
    const db = prisma({
      externalProviderOAuthState: {
        deleteMany: jest.fn(), create: jest.fn(), delete: jest.fn(),
        findUnique: jest.fn().mockResolvedValue({ id: 'state_1', tenantId: 'tenant_1', provider: 'spacefast', stateHash: 'unused', codeVerifierPayload: vault.encrypt({ verifier: 'verifier' }), expiresAt: new Date(Date.now() + 60_000) }),
      },
    });
    global.fetch = jest.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: 'oauth-access', refresh_token: 'refresh-value', expires_in: 3600, scope: 'teams:read spaces:write publish:write offline_access' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { teams: [{ id: 'team_1', name: 'AetherHost' }] } }), { status: 200 })) as any;
    const service = new SpacefastOAuthService(db as any, vault as any, config({
      SPACEFAST_OAUTH_CLIENT_ID: 'client_1', SPACEFAST_OAUTH_CLIENT_SECRET: 'secret_1', SPACEFAST_OAUTH_REDIRECT_URI: 'https://api.example.com/v1/integrations/spacefast/oauth/callback', SPACEFAST_OAUTH_SUCCESS_REDIRECT: 'https://console.example.com/console',
    }) as any);
    await expect(service.complete({ state: 'valid-state', code: 'authorization-code' })).resolves.toBe('https://console.example.com/console?spacefast=connected');
    const upsert = db.externalProviderConnection.upsert.mock.calls[0][0].create;
    expect(upsert).toMatchObject({ tenantId: 'tenant_1', provider: 'spacefast', teamId: 'team_1', status: 'connected' });
    expect(JSON.stringify(upsert.tokenPayload)).not.toContain('oauth-access');
    expect(JSON.stringify(upsert.tokenPayload)).not.toContain('refresh-value');
  });

  it('refreshes an expiring tenant credential server-side without returning it', async () => {
    const db = prisma({
      externalProviderConnection: {
        findUnique: jest.fn().mockResolvedValue({ id: 'connection_1', tenantId: 'tenant_1', provider: 'spacefast', teamId: 'team_1', status: 'connected', tokenPayload: vault.encrypt({ access_token: 'old-access', refresh_token: 'refresh-value' }), expiresAt: new Date(Date.now() - 1_000) }),
        update: jest.fn().mockResolvedValue({}), delete: jest.fn(), upsert: jest.fn(),
      },
    });
    global.fetch = jest.fn().mockResolvedValue(new Response(JSON.stringify({ access_token: 'new-access', refresh_token: 'new-refresh', expires_in: 3600, scope: 'teams:read spaces:write publish:write offline_access' }), { status: 200 })) as any;
    const service = new SpacefastOAuthService(db as any, vault as any, config({
      SPACEFAST_OAUTH_CLIENT_ID: 'client_1', SPACEFAST_OAUTH_CLIENT_SECRET: 'secret_1', SPACEFAST_OAUTH_REDIRECT_URI: 'https://api.example.com/v1/integrations/spacefast/oauth/callback', SPACEFAST_OAUTH_SUCCESS_REDIRECT: 'https://console.example.com/console',
    }) as any);
    await expect(service.publisherForTenant('tenant_1')).resolves.toMatchObject({ teamId: 'team_1' });
    expect(db.externalProviderConnection.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ tokenPayload: expect.objectContaining({ __encrypted: true }) }) }));
    expect(JSON.stringify(db.externalProviderConnection.update.mock.calls)).not.toContain('new-access');
    expect(JSON.stringify(db.externalProviderConnection.update.mock.calls)).not.toContain('new-refresh');
  });
});
