import { BadRequestException, ConflictException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { createHash, randomUUID } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { SpacefastApiError, type SpacefastPublishReceipt } from './spacefast.client';
import { SpacefastOAuthService } from './spacefast-oauth.service';
import { SpacefastService } from './spacefast.service';

const PROVIDER = 'spacefast';
/**
 * A publish that has no provider operation after this long was interrupted
 * (API restart, hung upload). It is longer than any bounded 10 MiB upload and
 * well inside Spacefast's 24-hour idempotency replay window, so a resumed
 * attempt can replay the original provider response instead of duplicating it.
 */
export const PUBLISH_LEASE_MS = 10 * 60 * 1000;
const TERMINAL_OPERATION_STATUSES = ['succeeded', 'failed', 'canceled'];
const EXPORT_DIRECTORIES = ['public', 'dist'] as const;
const STATIC_EXTENSIONS = new Set([
  '.html', '.css', '.js', '.mjs', '.json', '.svg', '.png', '.jpg', '.jpeg',
  '.gif', '.webp', '.ico', '.txt', '.woff', '.woff2', '.ttf',
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
    private readonly oauth: SpacefastOAuthService,
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

  async publish(tenantId: string, applicationId: string, consent: boolean, actorTenantId: string) {
    if (consent !== true) {
      throw new BadRequestException('Explicit consent is required before sending an artifact to Spacefast');
    }
    const app = await this.prisma.application.findFirst({
      where: { id: applicationId, tenantId, status: { notIn: ['terminated', 'suspended'] } },
      select: { id: true, tenantId: true, name: true, aiFiles: true },
    });
    if (!app) throw new NotFoundException('Application not found');

    // The managed publisher belongs to the operator. Other tenants must have
    // their own connected provider account before a publish is attempted.
    const customerPublisher = await this.oauth.publisherForTenant(tenantId);
    const ownerTenantId = process.env.AETHERPRESS_DEMO_OWNER_TENANT_ID?.trim();
    if (!customerPublisher && (!ownerTenantId || tenantId !== ownerTenantId || actorTenantId !== ownerTenantId)) {
      throw new ServiceUnavailableException('Connecting your own Spacefast account is not available yet. We are awaiting provider access.');
    }

    const artifact = selectStaticArtifact(app.aiFiles);
    if (!artifact) {
      throw new BadRequestException(
        staticArtifactError(app.aiFiles),
      );
    }

    const claim = await this.claimPublish(tenantId, applicationId, artifact.indexPath);
    if (!claim.claimed) return publicDeployment(claim.deployment);
    let deployment = claim.deployment;
    const idempotencyKey = deployment.idempotencyKey;
    await this.audit(tenantId, applicationId, 'EXTERNAL_FRONTEND_CONSENTED', {
      provider: PROVIDER, artifactPath: artifact.indexPath, fileCount: artifact.files.length,
      resumed: claim.resumed,
    });

    try {
      const { client, teamId } = customerPublisher ?? this.spacefast.publisher();
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
      // Spacefast rejects a reused key with a different body (409
      // idempotency_key_reused). Binding the key to the content means a
      // resumed attempt with unchanged files replays the original upload,
      // while changed files are sent as a genuinely new request.
      const receipt = await client.publishArchive({
        spaceId,
        archive: createZip(artifact.files),
        fileName: 'aetherhost-static-export.zip',
        idempotencyKey: `${idempotencyKey}:publish:${artifactDigest(artifact.files)}`,
      });
      const outcome = publishOutcome(receipt);
      const updated = await this.prisma.externalFrontendDeployment.update({
        where: { id: deployment.id },
        data: {
          spaceId, spaceSlug, liveUrl, versionId: receipt.version.id,
          immutableUrl: receipt.version.immutableUrl ?? null,
          operationId: receipt.operation?.id ?? null,
          status: outcome.status, lastErrorCode: outcome.errorCode,
        },
      });
      await this.audit(tenantId, applicationId, 'EXTERNAL_FRONTEND_PUBLISH_REQUESTED', {
        provider: PROVIDER, artifactPath: artifact.indexPath, fileCount: artifact.files.length, deploymentId: updated.id,
      });
      if (outcome.errorCode) {
        await this.audit(tenantId, applicationId, 'EXTERNAL_FRONTEND_PUBLISH_FAILED', {
          provider: PROVIDER, errorCode: outcome.errorCode,
        });
      }
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
      const publisher = (await this.oauth.publisherForTenant(tenantId)) ?? this.spacefast.publisher();
      const operation = await publisher.client.getOperation(deployment.operationId);
      const terminal = TERMINAL_OPERATION_STATUSES.includes(operation.status);
      const updated = await this.prisma.externalFrontendDeployment.update({
        where: { id: deployment.id },
        data: terminal
          ? { status: operation.status === 'succeeded' ? 'published' : 'failed', lastErrorCode: operation.status === 'succeeded' ? null : operation.status }
          // Touch the row so the reconciler's oldest-first batch rotates
          // through every pending publish instead of rechecking the same ones.
          : { updatedAt: new Date() },
      });
      if (terminal) await this.audit(tenantId, applicationId, 'EXTERNAL_FRONTEND_OPERATION_REFRESHED', {
        provider: PROVIDER, status: operation.status,
      });
      return publicDeployment(updated);
    } catch (error) {
      // Operation expiry is not documented by Spacefast. A 404 is permanent,
      // so stop polling it rather than retrying every minute forever.
      if (error instanceof SpacefastApiError && error.status === 404) {
        const updated = await this.prisma.externalFrontendDeployment.update({
          where: { id: deployment.id },
          data: { status: 'failed', lastErrorCode: 'operation_not_found' },
        });
        await this.audit(tenantId, applicationId, 'EXTERNAL_FRONTEND_OPERATION_REFRESHED', {
          provider: PROVIDER, status: 'operation_not_found',
        });
        return publicDeployment(updated);
      }
      const provider = error as { code?: string };
      throw new ServiceUnavailableException(`Spacefast operation refresh failed: ${provider.code ?? 'unavailable'}`);
    }
  }

  /**
   * Marks publishes that were interrupted before Spacefast returned an
   * operation as failed, so they are visible and retryable instead of stuck.
   */
  async expireAbandonedPublishes(now = new Date()): Promise<number> {
    const abandoned = await this.prisma.externalFrontendDeployment.findMany({
      where: abandonedWhere(now),
      select: { id: true, tenantId: true, applicationId: true },
      take: 100,
    });
    let expired = 0;
    for (const deployment of abandoned) {
      // Re-check the condition in the write so a publish that resumed or
      // finished in the meantime is not overwritten.
      const result = await this.prisma.externalFrontendDeployment.updateMany({
        where: { id: deployment.id, ...abandonedWhere(now) },
        data: { status: 'failed', lastErrorCode: 'interrupted' },
      });
      if (result.count === 1) {
        expired += 1;
        await this.audit(deployment.tenantId, deployment.applicationId, 'EXTERNAL_FRONTEND_PUBLISH_FAILED', {
          provider: PROVIDER, errorCode: 'interrupted',
        });
      }
    }
    return expired;
  }

  /**
   * Atomically takes ownership of the single publish slot for an application.
   * Two concurrent requests cannot both upload: the losing request gets the
   * current record back. An interrupted attempt is resumed with its original
   * idempotency key so Spacefast replays, rather than repeats, provider work.
   */
  private async claimPublish(tenantId: string, applicationId: string, artifactPath: string): Promise<
    | { claimed: true; resumed: boolean; deployment: DeploymentRow }
    | { claimed: false; deployment: DeploymentRow }
  > {
    const where = { applicationId_provider: { applicationId, provider: PROVIDER } };
    const existing = await this.prisma.externalFrontendDeployment.findUnique({ where });
    const now = new Date();
    if (existing?.status === 'publishing' && !isAbandoned(existing, now)) {
      return { claimed: false, deployment: existing };
    }

    const resumed = existing?.status === 'publishing';
    const attempt = {
      artifactPath, consentedAt: now, status: 'publishing',
      idempotencyKey: resumed ? existing.idempotencyKey : randomUUID(),
      lastErrorCode: null, immutableUrl: null, versionId: null, operationId: null,
    };

    if (!existing) {
      try {
        const created = await this.prisma.externalFrontendDeployment.create({
          data: { tenantId, applicationId, provider: PROVIDER, ...attempt },
        });
        return { claimed: true, resumed: false, deployment: created };
      } catch (error) {
        if ((error as { code?: string })?.code !== 'P2002') throw error;
        return { claimed: false, deployment: await this.currentOrConflict(where) };
      }
    }

    // Optimistic concurrency: the write only applies if nobody else has
    // changed the row since it was read.
    const result = await this.prisma.externalFrontendDeployment.updateMany({
      where: { id: existing.id, updatedAt: existing.updatedAt },
      data: attempt,
    });
    if (result.count !== 1) {
      return { claimed: false, deployment: await this.currentOrConflict(where) };
    }
    const claimed = await this.prisma.externalFrontendDeployment.findUnique({ where });
    if (!claimed) throw new ConflictException('The Spacefast publish record changed. Try again.');
    return { claimed: true, resumed, deployment: claimed };
  }

  private async currentOrConflict(where: { applicationId_provider: { applicationId: string; provider: string } }) {
    const current = await this.prisma.externalFrontendDeployment.findUnique({ where });
    if (!current) throw new ConflictException('Another Spacefast publish changed this record. Try again.');
    return current;
  }

  private async audit(tenantId: string, resourceId: string, action: string, metadata: Record<string, unknown>) {
    await this.prisma.auditLog.create({
      data: { tenantId, action, resourceId, metadata: JSON.parse(JSON.stringify(metadata)) },
    });
  }
}

type DeploymentRow = NonNullable<Awaited<ReturnType<PrismaService['externalFrontendDeployment']['findUnique']>>>;

function isAbandoned(deployment: { status: string; operationId: string | null; updatedAt: Date }, now: Date) {
  return deployment.status === 'publishing'
    && !deployment.operationId
    && now.getTime() - deployment.updatedAt.getTime() > PUBLISH_LEASE_MS;
}

function abandonedWhere(now: Date) {
  return {
    provider: PROVIDER,
    status: 'publishing',
    operationId: null,
    updatedAt: { lt: new Date(now.getTime() - PUBLISH_LEASE_MS) },
  };
}

/**
 * Maps a publish receipt to a durable status. AetherHost does not drive the
 * multi-step upload/finalize flow, so a receipt that is neither finished nor
 * pollable is a failure, not an indefinite "publishing".
 */
export function publishOutcome(receipt: SpacefastPublishReceipt): { status: 'published' | 'publishing' | 'failed'; errorCode: string | null } {
  const operationStatus = receipt.operation?.status;
  if (operationStatus === 'succeeded' || receipt.next?.action === 'done') return { status: 'published', errorCode: null };
  if (operationStatus === 'failed' || operationStatus === 'canceled') return { status: 'failed', errorCode: operationStatus };
  if (receipt.operation?.id) return { status: 'publishing', errorCode: null };
  return { status: 'failed', errorCode: 'operation_missing' };
}

/** A stable content digest; the same files always produce the same key. */
export function artifactDigest(files: Array<{ path: string; content: string }>) {
  const hash = createHash('sha256');
  for (const file of files) {
    hash.update(file.path).update('\0').update(file.content).update('\0');
  }
  return hash.digest('hex').slice(0, 32);
}

export function selectStaticArtifact(value: unknown): { indexPath: string; files: Array<{ path: string; content: string }> } | null {
  if (!Array.isArray(value)) return null;
  const files = value as AiFile[];
  const indexPath = EXPORT_DIRECTORIES
    .map((directory) => `${directory}/index.html`)
    .find((path) => files.some((file) => file.path === path && typeof file.content === 'string'));
  if (!indexPath) return null;

  const exportDirectory = indexPath.slice(0, indexPath.lastIndexOf('/'));
  const prefix = `${exportDirectory}/`;

  const selected = files
    .filter((file): file is { path: string; content: string } => typeof file.path === 'string' && typeof file.content === 'string')
    .filter((file) => file.path.startsWith(prefix))
    .filter((file) => isSafeStaticPath(file.path))
    .filter((file) => !isExcludedStaticPath(file.path))
    .map((file) => ({ path: file.path.slice(prefix.length), content: file.content }));
  const bytes = selected.reduce((total, file) => total + new TextEncoder().encode(file.content).byteLength, 0);
  if (selected.length === 0 || selected.length > MAX_STATIC_FILES || bytes > MAX_STATIC_BYTES) {
    throw new BadRequestException('The static export must contain at most 200 safe static files and be 10 MiB or smaller.');
  }
  return { indexPath, files: selected };
}

function staticArtifactError(value: unknown) {
  if (Array.isArray(value) && value.some((file: AiFile) => file.path === 'index.html' && typeof file.content === 'string')) {
    return 'This application has a root-level index.html. Spacefast exports must be stored in public/ or dist/ so backend files cannot be published. Recreate this legacy app from the current template or move its frontend files into public/ or dist/ before publishing.';
  }
  return 'No explicit static export is available. Put index.html and its browser assets in public/ or dist/ before publishing externally.';
}

function isSafeStaticPath(path: string) {
  if (path.startsWith('/') || path.includes('\\') || path.split('/').some((segment) => !segment || segment === '.' || segment === '..')) return false;
  const lower = path.toLowerCase();
  return [...STATIC_EXTENSIONS].some((extension) => lower.endsWith(extension));
}

function isExcludedStaticPath(path: string) {
  const lower = path.toLowerCase();
  const basename = lower.slice(lower.lastIndexOf('/') + 1);
  if (basename.startsWith('.env') || basename.includes('.config.')) return true;
  return new Set([
    'package.json', 'package-lock.json', 'pnpm-lock.yaml', 'yarn.lock',
    'bun.lock', 'bun.lockb', 'npm-shrinkwrap.json', 'composer.lock',
    'poetry.lock', 'cargo.lock', 'go.sum',
  ]).has(basename);
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
