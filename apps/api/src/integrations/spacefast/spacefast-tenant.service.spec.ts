import { BadRequestException } from '@nestjs/common';

// Nest's Config package currently ships ESM-only in this workspace. This unit
// test exercises the tenant boundary with its collaborator mocked instead of
// loading configuration or a real provider credential.
jest.mock('./spacefast.service', () => ({ SpacefastService: class SpacefastService {} }));
jest.mock('./spacefast-oauth.service', () => ({ SpacefastOAuthService: class SpacefastOAuthService {} }));

import { createZip, selectStaticArtifact, SpacefastTenantService } from './spacefast-tenant.service';
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

  function makeService() {
    const prisma = {
      application: { findFirst: jest.fn().mockResolvedValue(baseApp) },
      externalFrontendDeployment: {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn().mockResolvedValue({ id: 'deploy_1', applicationId: baseApp.id, artifactPath: 'index.html', status: 'publishing', spaceId: null, spaceSlug: null, liveUrl: null, immutableUrl: null, versionId: null, operationId: null, lastErrorCode: null, updatedAt: new Date(), consentedAt: new Date() }),
        update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'deploy_1', applicationId: baseApp.id, artifactPath: 'index.html', status: data.status ?? 'publishing', spaceId: data.spaceId ?? 'spc_1', spaceSlug: data.spaceSlug ?? 'marketing-site', liveUrl: data.liveUrl ?? 'https://marketing-site.space.fast', immutableUrl: data.immutableUrl ?? null, versionId: data.versionId ?? null, operationId: data.operationId ?? null, lastErrorCode: data.lastErrorCode ?? null, updatedAt: new Date(), consentedAt: new Date() })),
      },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    };
    const client = {
      createPrivateSpace: jest.fn().mockResolvedValue({ id: 'spc_1', slug: 'marketing-site', liveUrl: 'https://marketing-site.space.fast' }),
      publishArchive: jest.fn().mockResolvedValue({ version: { id: 'ver_1', immutableUrl: 'https://version.space.fast' }, next: { action: 'done' } }),
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
