import { BadRequestException } from '@nestjs/common';

// Nest's Config package currently ships ESM-only in this workspace. This unit
// test exercises the tenant boundary with its collaborator mocked instead of
// loading configuration or a real provider credential.
jest.mock('./spacefast.service', () => ({ SpacefastService: class SpacefastService {} }));
jest.mock('./spacefast-oauth.service', () => ({ SpacefastOAuthService: class SpacefastOAuthService {} }));

import { createZip, selectStaticArtifact, SpacefastTenantService } from './spacefast-tenant.service';

describe('SpacefastTenantService', () => {
  const baseApp = {
    id: 'app_123456', tenantId: 'tenant_123', name: 'Marketing Site',
    aiFiles: [
      { path: 'index.html', content: '<!doctype html><link rel="stylesheet" href="/site.css"><h1>Hello</h1>' },
      { path: 'site.css', content: 'h1 { color: rebeccapurple; }' },
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
    await expect(service.publish('tenant_123', 'app_123456', false)).rejects.toBeInstanceOf(BadRequestException);
    expect(spacefast.publisher).not.toHaveBeenCalled();
  });

  it('publishes a bounded static export and never includes .env content', async () => {
    const { service, client, prisma } = makeService();
    await expect(service.publish('tenant_123', 'app_123456', true)).resolves.toMatchObject({ status: 'published', versionId: 'ver_1' });
    expect(client.createPrivateSpace).toHaveBeenCalledWith(expect.objectContaining({ teamId: 'team_1' }));
    const archive = client.publishArchive.mock.calls[0][0].archive as Blob;
    const text = new TextDecoder().decode(await archive.arrayBuffer());
    expect(text).toContain('index.html');
    expect(text).toContain('site.css');
    expect(text).not.toContain('.env');
    expect(text).not.toContain('DATABASE_URL');
    expect(prisma.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: 'EXTERNAL_FRONTEND_CONSENTED' }) }));
  });
});

describe('Spacefast static export boundary', () => {
  it('requires a known index.html path and only selects safe static files', () => {
    expect(selectStaticArtifact([{ path: 'package.json', content: '{}' }])).toBeNull();
    expect(selectStaticArtifact([
      { path: 'dist/index.html', content: '<h1>ok</h1>' },
      { path: 'dist/app.js', content: 'console.log(1)' },
      { path: '../secrets.txt', content: 'nope' },
    ])).toEqual({
      indexPath: 'dist/index.html',
      files: [
        { path: 'dist/index.html', content: '<h1>ok</h1>' },
        { path: 'dist/app.js', content: 'console.log(1)' },
      ],
    });
  });

  it('creates a valid-looking ZIP with a central directory', async () => {
    const bytes = new Uint8Array(await createZip([{ path: 'index.html', content: '<h1>ok</h1>' }]).arrayBuffer());
    expect(new DataView(bytes.buffer).getUint32(0, true)).toBe(0x04034b50);
    expect(new DataView(bytes.buffer).getUint32(bytes.length - 22, true)).toBe(0x06054b50);
  });
});
