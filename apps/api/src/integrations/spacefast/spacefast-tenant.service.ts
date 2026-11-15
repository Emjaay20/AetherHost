import { BadRequestException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { SpacefastApiError } from './spacefast.client';
import { SpacefastService } from './spacefast.service';

const PROVIDER = 'spacefast';
const INDEX_PATHS = ['index.html', 'public/index.html', 'dist/index.html'];
const STATIC_EXTENSIONS = new Set([
  '.html', '.css', '.js', '.mjs', '.json', '.svg', '.png', '.jpg', '.jpeg',
  '.gif', '.webp', '.ico', '.txt', '.map', '.woff', '.woff2', '.ttf',
  '.webmanifest',
]);
const MAX_STATIC_FILES = 200;
const MAX_STATIC_BYTES = 10 * 1024 * 1024;

type AiFile = { path?: unknown; content?: unknown };

@Injectable()
export class SpacefastTenantService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly spacefast: SpacefastService,
  ) {}

  async list(tenantId: string) {
    return this.prisma.externalFrontendDeployment.findMany({
      where: { tenantId, provider: PROVIDER },
      orderBy: { updatedAt: 'desc' },
      select: {
        applicationId: true, artifactPath: true, status: true, spaceSlug: true,
        liveUrl: true, immutableUrl: true, versionId: true, operationId: true,
        lastErrorCode: true, updatedAt: true, consentedAt: true,
      },
    });
  }

  async publish(tenantId: string, applicationId: string, consent: boolean) {
    if (consent !== true) {
      throw new BadRequestException('Explicit consent is required before sending an artifact to Spacefast');
    }
    const app = await this.prisma.application.findFirst({
      where: { id: applicationId, tenantId, status: { notIn: ['terminated', 'suspended'] } },
      select: { id: true, tenantId: true, name: true, aiFiles: true },
    });
    if (!app) throw new NotFoundException('Application not found');

    const artifact = selectStaticArtifact(app.aiFiles);
    if (!artifact) {
      throw new BadRequestException(
        'No explicit static export with an index.html file is available for this application. Build and attach a static export before publishing it externally.',
      );
    }

    let deployment = await this.prisma.externalFrontendDeployment.findUnique({
      where: { applicationId_provider: { applicationId, provider: PROVIDER } },
    });
    if (deployment?.status === 'publishing') {
      return publicDeployment(deployment);
    }

    const idempotencyKey = randomUUID();
    deployment = await this.prisma.externalFrontendDeployment.upsert({
      where: { applicationId_provider: { applicationId, provider: PROVIDER } },
      create: {
        tenantId, applicationId, provider: PROVIDER, artifactPath: artifact.indexPath,
        consentedAt: new Date(), status: 'publishing', idempotencyKey,
      },
      update: {
        artifactPath: artifact.indexPath, consentedAt: new Date(), status: 'publishing',
        idempotencyKey, lastErrorCode: null, immutableUrl: null, versionId: null, operationId: null,
      },
    });
    await this.audit(tenantId, applicationId, 'EXTERNAL_FRONTEND_CONSENTED', {
      provider: PROVIDER, artifactPath: artifact.indexPath, fileCount: artifact.files.length,
    });

    try {
      const { client, teamId } = this.spacefast.publisher();
      let spaceId = deployment.spaceId;
      let spaceSlug = deployment.spaceSlug;
      let liveUrl = deployment.liveUrl;
      if (!spaceId) {
        const space = await client.createPrivateSpace({
          teamId,
          slug: externalSlug(app.name, app.id),
          title: `${app.name} external frontend`,
          idempotencyKey: `${idempotencyKey}:space`,
        });
        spaceId = space.id;
        spaceSlug = space.slug;
        liveUrl = space.liveUrl ?? null;
        // Persist the provider resource before the upload. A later retry can
        // reuse this private Space instead of creating another one.
        deployment = await this.prisma.externalFrontendDeployment.update({
          where: { id: deployment.id },
          data: { spaceId, spaceSlug, liveUrl },
        });
      }
      const receipt = await client.publishArchive({
        spaceId,
        archive: createZip(artifact.files),
        fileName: 'aetherhost-static-export.zip',
        idempotencyKey: `${idempotencyKey}:publish`,
      });
      const updated = await this.prisma.externalFrontendDeployment.update({
        where: { id: deployment.id },
        data: {
          spaceId, spaceSlug, liveUrl, versionId: receipt.version.id,
          immutableUrl: receipt.version.immutableUrl ?? null,
          operationId: receipt.operation?.id ?? null,
          status: receipt.operation?.status === 'succeeded' || receipt.next?.action === 'done' ? 'published' : 'publishing',
        },
      });
      await this.audit(tenantId, applicationId, 'EXTERNAL_FRONTEND_PUBLISH_REQUESTED', {
        provider: PROVIDER, artifactPath: artifact.indexPath, fileCount: artifact.files.length, deploymentId: updated.id,
      });
      return publicDeployment(updated);
    } catch (error) {
      const provider = error instanceof SpacefastApiError ? error : undefined;
      await this.prisma.externalFrontendDeployment.update({
        where: { id: deployment.id },
        data: { status: 'failed', lastErrorCode: provider?.code ?? 'publish_failed' },
      });
      await this.audit(tenantId, applicationId, 'EXTERNAL_FRONTEND_PUBLISH_FAILED', {
        provider: PROVIDER, errorCode: provider?.code ?? 'publish_failed',
      });
      if (provider) throw new BadRequestException(`Spacefast publish failed: ${provider.code ?? provider.status}`);
      throw new ServiceUnavailableException('Spacefast publishing is unavailable');
    }
  }

  async refresh(tenantId: string, applicationId: string) {
    const deployment = await this.prisma.externalFrontendDeployment.findFirst({
      where: { tenantId, applicationId, provider: PROVIDER },
    });
    if (!deployment) throw new NotFoundException('No Spacefast publish exists for this application');
    if (!deployment.operationId || deployment.status !== 'publishing') return publicDeployment(deployment);

    try {
      const operation = await this.spacefast.publisher().client.getOperation(deployment.operationId);
      const terminal = ['succeeded', 'failed', 'canceled'].includes(operation.status);
      const updated = await this.prisma.externalFrontendDeployment.update({
        where: { id: deployment.id },
        data: terminal
          ? { status: operation.status === 'succeeded' ? 'published' : 'failed', lastErrorCode: operation.status === 'succeeded' ? null : operation.status }
          : {},
      });
      if (terminal) await this.audit(tenantId, applicationId, 'EXTERNAL_FRONTEND_OPERATION_REFRESHED', {
        provider: PROVIDER, status: operation.status,
      });
      return publicDeployment(updated);
    } catch (error) {
      const provider = error as { code?: string };
      throw new ServiceUnavailableException(`Spacefast operation refresh failed: ${provider.code ?? 'unavailable'}`);
    }
  }

  private async audit(tenantId: string, resourceId: string, action: string, metadata: Record<string, unknown>) {
    await this.prisma.auditLog.create({
      data: { tenantId, action, resourceId, metadata: JSON.parse(JSON.stringify(metadata)) },
    });
  }
}

export function selectStaticArtifact(value: unknown): { indexPath: string; files: Array<{ path: string; content: string }> } | null {
  if (!Array.isArray(value)) return null;
  const files = value as AiFile[];
  const indexPath = INDEX_PATHS.find((path) => files.some((file) => file.path === path && typeof file.content === 'string'));
  if (!indexPath) return null;

  const selected = files
    .filter((file): file is { path: string; content: string } => typeof file.path === 'string' && typeof file.content === 'string')
    .filter((file) => isSafeStaticPath(file.path));
  const bytes = selected.reduce((total, file) => total + new TextEncoder().encode(file.content).byteLength, 0);
  if (selected.length === 0 || selected.length > MAX_STATIC_FILES || bytes > MAX_STATIC_BYTES) {
    throw new BadRequestException('The static export must contain at most 200 safe static files and be 10 MiB or smaller.');
  }
  return { indexPath, files: selected };
}

function isSafeStaticPath(path: string) {
  if (path.startsWith('/') || path.includes('\\') || path.split('/').some((segment) => !segment || segment === '.' || segment === '..')) return false;
  const lower = path.toLowerCase();
  return [...STATIC_EXTENSIONS].some((extension) => lower.endsWith(extension));
}

function externalSlug(name: string, applicationId: string) {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 34) || 'app';
  return `${base}-${applicationId.slice(-6).toLowerCase()}`;
}

/** A minimal, stored ZIP for an already-sanitized static export. */
export function createZip(files: Array<{ path: string; content: string }>): Blob {
  const encoder = new TextEncoder();
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;

  for (const file of files) {
    const name = encoder.encode(file.path);
    const data = encoder.encode(file.content);
    const crc = crc32(data);
    const local = new Uint8Array(30 + name.length + data.length);
    const view = new DataView(local.buffer);
    view.setUint32(0, 0x04034b50, true);
    view.setUint16(4, 20, true);
    view.setUint16(8, 0, true);
    view.setUint32(14, crc, true);
    view.setUint32(18, data.length, true);
    view.setUint32(22, data.length, true);
    view.setUint16(26, name.length, true);
    local.set(name, 30);
    local.set(data, 30 + name.length);
    parts.push(local);

    const entry = new Uint8Array(46 + name.length);
    const entryView = new DataView(entry.buffer);
    entryView.setUint32(0, 0x02014b50, true);
    entryView.setUint16(4, 20, true);
    entryView.setUint16(6, 20, true);
    entryView.setUint16(10, 0, true);
    entryView.setUint32(16, crc, true);
    entryView.setUint32(20, data.length, true);
    entryView.setUint32(24, data.length, true);
    entryView.setUint16(28, name.length, true);
    entryView.setUint32(42, offset, true);
    entry.set(name, 46);
    central.push(entry);
    offset += local.length;
  }

  const centralSize = central.reduce((total, entry) => total + entry.length, 0);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(8, files.length, true);
  endView.setUint16(10, files.length, true);
  endView.setUint32(12, centralSize, true);
  endView.setUint32(16, offset, true);
  // Copy into ArrayBuffer-backed views. Node's newer typed-array definitions
  // also permit SharedArrayBuffer, whereas Blob deliberately does not.
  const blobParts: BlobPart[] = [...parts, ...central, end].map((part) => Uint8Array.from(part).buffer);
  return new Blob(blobParts, { type: 'application/zip' });
}

function crc32(data: Uint8Array) {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function publicDeployment(deployment: {
  applicationId: string; artifactPath: string; status: string; spaceSlug: string | null; liveUrl: string | null;
  immutableUrl: string | null; versionId: string | null; operationId: string | null; lastErrorCode: string | null;
  updatedAt: Date; consentedAt: Date;
}) {
  return {
    applicationId: deployment.applicationId, artifactPath: deployment.artifactPath, status: deployment.status,
    spaceSlug: deployment.spaceSlug, liveUrl: deployment.liveUrl, immutableUrl: deployment.immutableUrl,
    versionId: deployment.versionId, operationId: deployment.operationId, lastErrorCode: deployment.lastErrorCode,
    updatedAt: deployment.updatedAt, consentedAt: deployment.consentedAt,
  };
}
