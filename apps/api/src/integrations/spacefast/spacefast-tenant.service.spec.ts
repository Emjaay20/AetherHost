import { BadRequestException } from '@nestjs/common';

// Nest's Config package currently ships ESM-only in this workspace. This unit
// test exercises the tenant boundary with its collaborator mocked instead of
// loading configuration or a real provider credential.
jest.mock('./spacefast.service', () => ({ SpacefastService: class SpacefastService {} }));
jest.mock('./spacefast-oauth.service', () => ({ SpacefastOAuthService: class SpacefastOAuthService {} }));

import { artifactDigest, createZip, PUBLISH_LEASE_MS, selectStaticArtifact, SpacefastTenantService } from './spacefast-tenant.service';
import { SpacefastApiError } from './spacefast.client';
import { createAetherPressLaunchpadFiles } from '../../applications/aetherpress-launchpad.template';

describe('SpacefastTenantService', () => {
  const originalOwner = process.env.AETHERPRESS_DEMO_OWNER_TENANT_ID;
  beforeEach(() => { process.env.AETHERPRESS_DEMO_OWNER_TENANT_ID = 'tenant_123'; });
  afterEach(() => { if (originalOwner === undefined) delete process.env.AETHERPRESS_DEMO_OWNER_TENANT_ID; else process.env.AETHERPRESS_DEMO_OWNER_TENANT_ID = originalOwner; });
  const baseApp = {
    id: 'app_123456', tenantId: 'tenant_123', name: 'Marketing Site',
    aiFiles: [
      { path: 'public/index.html', content: '<!doctype html><link rel="stylesheet" href="/site.css"><h1>Hello</h1>' },
      { path: 'public/site.css', content: 'h1 { color: rebeccapurple; }' },
      { path: '.env', content: 'DATABASE_URL=must-not-leave-aetherhost' },
    ],
  };

  function row(overrides: Record<string, unknown> = {}) {
    return {
      id: 'deploy_1', tenantId: 'tenant_123', applicationId: baseApp.id, provider: 'spacefast', artifactPath: 'public/index.html',
      status: 'publishing', spaceId: null, spaceSlug: null, liveUrl: null, immutableUrl: null, versionId: null,
      operationId: null, lastErrorCode: null, idempotencyKey: 'key_new', updatedAt: new Date(), consentedAt: new Date(),
      ...overrides,
    };
  }
  const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60 * 1000);

  function makeService() {
    const prisma = {
      application: { findFirst: jest.fn().mockResolvedValue(baseApp) },
      externalFrontendDeployment: {
        findUnique: jest.fn().mockResolvedValue(null),
        findFirst: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockImplementation(({ data }) => Promise.resolve(row({ idempotencyKey: data.idempotencyKey }))),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'deploy_1', applicationId: baseApp.id, artifactPath: 'index.html', status: data.status ?? 'publishing', spaceId: data.spaceId ?? 'spc_1', spaceSlug: data.spaceSlug ?? 'marketing-site', liveUrl: data.liveUrl ?? 'https://marketing-site.space.fast', immutableUrl: data.immutableUrl ?? null, versionId: data.versionId ?? null, operationId: data.operationId ?? null, lastErrorCode: data.lastErrorCode ?? null, updatedAt: new Date(), consentedAt: new Date() })),
      },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    };
    const client = {
      createPrivateSpace: jest.fn().mockResolvedValue({ id: 'spc_1', slug: 'marketing-site', liveUrl: 'https://marketing-site.space.fast' }),
      publishArchive: jest.fn().mockResolvedValue({ version: { id: 'ver_1', immutableUrl: 'https://version.space.fast' }, next: { action: 'done' } }),
      getOperation: jest.fn(),
    };
    const spacefast = { publisher: jest.fn().mockReturnValue({ client, teamId: 'team_1' }) };
    return { service: new SpacefastTenantService(prisma as any, spacefast as any, { publisherForTenant: jest.fn().mockResolvedValue(null) } as any), prisma, client, spacefast };
  }

  it('requires explicit consent before it contacts Spacefast', async () => {
    const { service, spacefast } = makeService();
    await expect(service.publish('tenant_123', 'app_123456', false, 'tenant_123')).rejects.toBeInstanceOf(BadRequestException);
    expect(spacefast.publisher).not.toHaveBeenCalled();
  });

  it('does not publish another tenant to the operator account', async () => {
    const { service, spacefast, prisma } = makeService();
    await expect(service.publish('other_tenant', 'app_123456', true, 'other_tenant')).rejects.toThrow('awaiting provider access');
    expect(spacefast.publisher).not.toHaveBeenCalled();
    expect(prisma.externalFrontendDeployment.upsert).not.toHaveBeenCalled();
  });

  it('does not permit an impersonating actor to use the managed publisher', async () => {
    const { service, spacefast } = makeService();
    await expect(service.publish('tenant_123', 'app_123456', true, 'other_tenant')).rejects.toThrow('awaiting provider access');
    expect(spacefast.publisher).not.toHaveBeenCalled();
  });

  it('publishes a bounded static export and never includes .env content', async () => {
    const { service, client, prisma } = makeService();
    await expect(service.publish('tenant_123', 'app_123456', true, 'tenant_123')).resolves.toMatchObject({ status: 'published', versionId: 'ver_1' });
    expect(client.createPrivateSpace).toHaveBeenCalledWith(expect.objectContaining({ teamId: 'team_1' }));
    const archive = client.publishArchive.mock.calls[0][0].archive as Blob;
    const text = new TextDecoder().decode(await archive.arrayBuffer());
    expect(text).toContain('index.html');
    expect(text).toContain('site.css');
    expect(text).not.toContain('.env');
    expect(text).not.toContain('DATABASE_URL');
    expect(text).not.toContain('public/');
    expect(prisma.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: 'EXTERNAL_FRONTEND_CONSENTED' }) }));
  });

  it('explains how legacy root-level applications become eligible', async () => {
    const { service, prisma } = makeService();
    prisma.application.findFirst.mockResolvedValueOnce({
      ...baseApp,
      aiFiles: [
        { path: 'index.html', content: '<h1>legacy</h1>' },
        { path: 'server.mjs', content: 'console.log("backend")' },
      ],
    });

    await expect(service.publish('tenant_123', 'app_123456', true, 'tenant_123')).rejects.toThrow(
      'Spacefast exports must be stored in public/ or dist/',
    );
  });

  describe('interrupted and concurrent publishes', () => {
    it('leaves a publish that is genuinely in flight alone', async () => {
      const { service, prisma, client } = makeService();
      prisma.externalFrontendDeployment.findUnique.mockResolvedValueOnce(row({ operationId: 'op_1', updatedAt: minutesAgo(30) }));
      await expect(service.publish('tenant_123', 'app_123456', true)).resolves.toMatchObject({ status: 'publishing', operationId: 'op_1' });
      prisma.externalFrontendDeployment.findUnique.mockResolvedValueOnce(row({ updatedAt: minutesAgo(1) }));
      await expect(service.publish('tenant_123', 'app_123456', true)).resolves.toMatchObject({ status: 'publishing' });
      expect(client.createPrivateSpace).not.toHaveBeenCalled();
      expect(client.publishArchive).not.toHaveBeenCalled();
      expect(prisma.externalFrontendDeployment.updateMany).not.toHaveBeenCalled();
    });

    it('resumes a publish interrupted after Space creation with its original key', async () => {
      const { service, prisma, client } = makeService();
      const stale = row({ idempotencyKey: 'key_old', spaceId: 'spc_saved', spaceSlug: 'saved', updatedAt: minutesAgo(11) });
      prisma.externalFrontendDeployment.findUnique
        .mockResolvedValueOnce(stale)
        .mockResolvedValueOnce({ ...stale, updatedAt: new Date() });

      await expect(service.publish('tenant_123', 'app_123456', true)).resolves.toMatchObject({ status: 'published' });
      expect(prisma.externalFrontendDeployment.updateMany).toHaveBeenCalledWith(expect.objectContaining({
        where: { id: 'deploy_1', updatedAt: stale.updatedAt },
        data: expect.objectContaining({ status: 'publishing', idempotencyKey: 'key_old' }),
      }));
      expect(client.createPrivateSpace).not.toHaveBeenCalled();
      expect(client.publishArchive).toHaveBeenCalledWith(expect.objectContaining({ spaceId: 'spc_saved' }));
      expect(client.publishArchive.mock.calls[0][0].idempotencyKey).toMatch(/^key_old:publish:[0-9a-f]{32}$/);
    });

    it('resumes a publish interrupted before Space creation without creating a second Space', async () => {
      const { service, prisma, client } = makeService();
      const stale = row({ idempotencyKey: 'key_old', updatedAt: minutesAgo(11) });
      prisma.externalFrontendDeployment.findUnique.mockResolvedValueOnce(stale).mockResolvedValueOnce(stale);

      await service.publish('tenant_123', 'app_123456', true);
      // Spacefast replays the stored response for a repeated key, so the
      // Space from the interrupted attempt is returned instead of a new one.
      expect(client.createPrivateSpace).toHaveBeenCalledWith(expect.objectContaining({ idempotencyKey: 'key_old:space' }));
    });

    it('starts a fresh attempt with a new key after a finished publish', async () => {
      const { service, prisma, client } = makeService();
      const done = row({ status: 'published', idempotencyKey: 'key_old', spaceId: 'spc_saved' });
      prisma.externalFrontendDeployment.findUnique.mockResolvedValueOnce(done).mockResolvedValueOnce({ ...done, status: 'publishing', idempotencyKey: 'key_fresh' });

      await service.publish('tenant_123', 'app_123456', true);
      const claim = prisma.externalFrontendDeployment.updateMany.mock.calls[0][0];
      expect(claim.data.idempotencyKey).not.toBe('key_old');
      expect(client.publishArchive.mock.calls[0][0].idempotencyKey).toMatch(/^key_fresh:publish:/);
    });

    it('lets only one of two concurrent publishes upload', async () => {
      const { service, prisma, client } = makeService();
      const done = row({ status: 'published' });
      prisma.externalFrontendDeployment.findUnique
        .mockResolvedValueOnce(done)
        .mockResolvedValueOnce(row({ status: 'publishing', idempotencyKey: 'winner' }));
      prisma.externalFrontendDeployment.updateMany.mockResolvedValueOnce({ count: 0 });

      await expect(service.publish('tenant_123', 'app_123456', true)).resolves.toMatchObject({ status: 'publishing' });
      expect(client.publishArchive).not.toHaveBeenCalled();
      expect(prisma.auditLog.create).not.toHaveBeenCalled();
    });

    it('lets only one of two concurrent first publishes create the record', async () => {
      const { service, prisma, client } = makeService();
      prisma.externalFrontendDeployment.create.mockRejectedValueOnce(Object.assign(new Error('unique'), { code: 'P2002' }));
      prisma.externalFrontendDeployment.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(row({ idempotencyKey: 'winner' }));

      await expect(service.publish('tenant_123', 'app_123456', true)).resolves.toMatchObject({ status: 'publishing' });
      expect(client.createPrivateSpace).not.toHaveBeenCalled();
      expect(client.publishArchive).not.toHaveBeenCalled();
    });

    it('fails a receipt that has neither an operation nor a finished result', async () => {
      const { service, prisma, client } = makeService();
      client.publishArchive.mockResolvedValueOnce({ version: { id: 'ver_1', status: 'pending' }, next: { action: 'finalize' } });

      await expect(service.publish('tenant_123', 'app_123456', true)).resolves.toMatchObject({ status: 'failed', lastErrorCode: 'operation_missing' });
      expect(prisma.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ action: 'EXTERNAL_FRONTEND_PUBLISH_FAILED' }),
      }));
    });

    it('fails a receipt whose operation already failed', async () => {
      const { service, client } = makeService();
      client.publishArchive.mockResolvedValueOnce({ version: { id: 'ver_1', status: 'pending' }, operation: { id: 'op_1', status: 'failed' } });
      await expect(service.publish('tenant_123', 'app_123456', true)).resolves.toMatchObject({ status: 'failed', lastErrorCode: 'failed' });
    });

    it('binds the publish key to the files so changed content is a new request', () => {
      const files = [{ path: 'index.html', content: '<h1>a</h1>' }];
      expect(artifactDigest(files)).toBe(artifactDigest([{ ...files[0] }]));
      expect(artifactDigest(files)).not.toBe(artifactDigest([{ path: 'index.html', content: '<h1>b</h1>' }]));
      expect(artifactDigest([{ path: 'ab', content: 'c' }])).not.toBe(artifactDigest([{ path: 'a', content: 'bc' }]));
    });
  });

  describe('refresh and abandoned-publish sweep', () => {
    it('stops polling an operation Spacefast no longer knows', async () => {
      const { service, prisma, client } = makeService();
      prisma.externalFrontendDeployment.findFirst.mockResolvedValueOnce(row({ operationId: 'op_gone' }));
      client.getOperation.mockRejectedValueOnce(new SpacefastApiError('not found', 404));

      await expect(service.refresh('tenant_123', 'app_123456')).resolves.toMatchObject({ status: 'failed', lastErrorCode: 'operation_not_found' });
    });

    it('keeps polling through other provider errors', async () => {
      const { service, prisma, client } = makeService();
      prisma.externalFrontendDeployment.findFirst.mockResolvedValueOnce(row({ operationId: 'op_1' }));
      client.getOperation.mockRejectedValueOnce(new SpacefastApiError('busy', 503));
      await expect(service.refresh('tenant_123', 'app_123456')).rejects.toThrow('Spacefast operation refresh failed');
      expect(prisma.externalFrontendDeployment.update).not.toHaveBeenCalled();
    });

    it('touches a still-running publish so the reconciler rotates through all of them', async () => {
      const { service, prisma, client } = makeService();
      prisma.externalFrontendDeployment.findFirst.mockResolvedValueOnce(row({ operationId: 'op_1' }));
      client.getOperation.mockResolvedValueOnce({ id: 'op_1', status: 'running' });
      await service.refresh('tenant_123', 'app_123456');
      expect(prisma.externalFrontendDeployment.update).toHaveBeenCalledWith(expect.objectContaining({
        data: { updatedAt: expect.any(Date) },
      }));
    });

    it('fails abandoned publishes once their lease expires, without overwriting a resumed one', async () => {
      const { service, prisma } = makeService();
      const now = new Date('2026-11-20T12:00:00Z');
      prisma.externalFrontendDeployment.findMany.mockResolvedValueOnce([
        { id: 'd1', tenantId: 'tenant_a', applicationId: 'app_a' },
        { id: 'd2', tenantId: 'tenant_b', applicationId: 'app_b' },
      ]);
      prisma.externalFrontendDeployment.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });

      await expect(service.expireAbandonedPublishes(now)).resolves.toBe(1);
      const expectedWhere = {
        provider: 'spacefast', status: 'publishing', operationId: null,
        updatedAt: { lt: new Date(now.getTime() - PUBLISH_LEASE_MS) },
      };
      expect(prisma.externalFrontendDeployment.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expectedWhere }));
      expect(prisma.externalFrontendDeployment.updateMany).toHaveBeenCalledWith({
        where: { id: 'd1', ...expectedWhere },
        data: { status: 'failed', lastErrorCode: 'interrupted' },
      });
      expect(prisma.auditLog.create).toHaveBeenCalledTimes(1);
      expect(prisma.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ tenantId: 'tenant_a', action: 'EXTERNAL_FRONTEND_PUBLISH_FAILED' }),
      }));
    });
  });
});

describe('Spacefast static export boundary', () => {
  it('publishes exactly the AetherPress browser export at the archive root', async () => {
    const artifact = selectStaticArtifact(createAetherPressLaunchpadFiles('https://editorial.example.com'));
    expect(artifact).toEqual(expect.objectContaining({
      indexPath: 'public/index.html',
      files: expect.arrayContaining([
        expect.objectContaining({ path: 'index.html' }),
        expect.objectContaining({ path: 'styles.css' }),
        expect.objectContaining({ path: 'app.js' }),
        expect.objectContaining({ path: 'config.js' }),
      ]),
    }));
    expect(artifact?.files).toHaveLength(4);
    const archive = new TextDecoder().decode(await createZip(artifact!.files).arrayBuffer());
    expect(archive).toContain('index.html');
    expect(archive).not.toContain('public/');
    expect(archive).not.toContain('package.json');
    expect(archive).not.toContain('server.mjs');
  });

  it('selects only the explicit public export and roots the archive there', () => {
    expect(selectStaticArtifact([{ path: 'package.json', content: '{}' }])).toBeNull();
    expect(selectStaticArtifact([
      { path: 'server.js', content: 'console.log("backend")' },
      { path: 'package.json', content: '{}' },
      { path: 'public/index.html', content: '<h1>ok</h1>' },
      { path: 'public/app.js', content: 'console.log(1)' },
      { path: 'public/site.js.map', content: 'source map' },
      { path: 'public/runtime.config.js', content: 'secret-like configuration' },
      { path: 'public/package.json', content: '{"scripts":{"start":"node server.js"}}' },
      { path: 'public/.env.local', content: 'DATABASE_URL=nope' },
      { path: '../secrets.txt', content: 'nope' },
    ])).toEqual({
      indexPath: 'public/index.html',
      files: [
        { path: 'index.html', content: '<h1>ok</h1>' },
        { path: 'app.js', content: 'console.log(1)' },
      ],
    });
  });

  it('roots a dist export and rejects root-only frontend files', () => {
    expect(selectStaticArtifact([
      { path: 'dist/index.html', content: '<h1>ok</h1>' },
      { path: 'dist/app.js', content: 'console.log(1)' },
      { path: 'server.js', content: 'console.log("backend")' },
    ])).toEqual({
      indexPath: 'dist/index.html',
      files: [
        { path: 'index.html', content: '<h1>ok</h1>' },
        { path: 'app.js', content: 'console.log(1)' },
      ],
    });
    expect(selectStaticArtifact([
      { path: 'index.html', content: '<h1>legacy app</h1>' },
      { path: 'server.mjs', content: 'console.log("backend")' },
    ])).toBeNull();
  });

  it('creates a valid-looking ZIP with a central directory', async () => {
    const bytes = new Uint8Array(await createZip([{ path: 'index.html', content: '<h1>ok</h1>' }]).arrayBuffer());
    expect(new DataView(bytes.buffer).getUint32(0, true)).toBe(0x04034b50);
    expect(new DataView(bytes.buffer).getUint32(bytes.length - 22, true)).toBe(0x06054b50);
  });
});
