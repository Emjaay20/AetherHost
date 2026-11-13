import { SpacefastApiError, SpacefastClient } from './spacefast.client';

describe('SpacefastClient', () => {
  const key = 'sfa_test_scoped_key';

  it('is disabled unless an operator explicitly enables it', () => {
    expect(SpacefastClient.fromEnvironment({})).toBeNull();
    expect(() => SpacefastClient.fromEnvironment({ SPACEFAST_ENABLED: 'true' })).toThrow(
      'SPACEFAST_ENABLED requires SPACEFAST_API_KEY',
    );
  });

  it('creates a private Space with an idempotency key', async () => {
    const fetchFn = jest.fn().mockResolvedValue(new Response(JSON.stringify({
      data: { space: { id: 'spc_123', slug: 'docs', liveUrl: 'https://docs.space.fast' } },
    }), { status: 201 }));
    const client = new SpacefastClient(key, fetchFn, 'https://api.spacefast.test');

    await expect(client.createPrivateSpace({
      teamId: 'team_123', slug: 'docs', title: 'Docs', idempotencyKey: 'idem-123',
    })).resolves.toEqual({ id: 'spc_123', slug: 'docs', liveUrl: 'https://docs.space.fast' });

    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe('https://api.spacefast.test/v1/spaces');
    expect(init.headers.get('authorization')).toBe(`Bearer ${key}`);
    expect(init.headers.get('idempotency-key')).toBe('idem-123');
    expect(JSON.parse(init.body)).toEqual({ teamId: 'team_123', slug: 'docs', title: 'Docs', access: 'private' });
  });

  it('returns safe provider diagnostics without exposing its credential', async () => {
    const fetchFn = jest.fn().mockResolvedValue(new Response(JSON.stringify({
      title: 'Forbidden', detail: 'scope is insufficient', code: 'insufficient_scope', requestId: 'req-body',
    }), { status: 403, headers: { 'x-request-id': 'req-header' } }));
    const client = new SpacefastClient(key, fetchFn, 'https://api.spacefast.test');

    await expect(client.getOperation('op_123')).rejects.toMatchObject<Partial<SpacefastApiError>>({
      status: 403, requestId: 'req-header', code: 'insufficient_scope', message: 'scope is insufficient',
    });
  });
});
