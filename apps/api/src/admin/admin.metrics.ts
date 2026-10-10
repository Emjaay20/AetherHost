import { PLANS } from '@aetherhost/domain';

export const STUCK_PENDING_SECONDS = 300;

export const CATALOG = Object.values(PLANS).map((plan) => ({
  id: plan.id,
  name: plan.name,
  monthlyPriceCent: plan.monthlyPriceCent,
  limits: plan.entitlements.limits,
}));

export type EntitlementRow = {
  limitApplications: number;
  limitAiRequests: number;
  limitStorageMb: number;
  limitBandwidthGb: number;
  usageApplications: number;
  usageAiRequests: number;
  usageStorageMb: number;
  usageBandwidthMb: number;
  usageBandwidthGb: number;
  totalAiTokens: number;
};

export type TenantInput = {
  id: string;
  name: string;
  planId: string;
  subscriptionStatus: string;
  createdAt: Date;
  entitlements: EntitlementRow | null;
  _count: { applications: number };
};

export type Meter = {
  used: number;
  limit: number;
  ratio: number;
  headroom: number;
};

export type TenantSignal = {
  id: string;
  name: string;
  planId: string;
  subscriptionStatus: string;
  createdAt: string;
  drift: string[];
  counterDrift: boolean;
  score: number;
  tokens: number;
  meters: {
    applications: Meter & { counted: number };
    aiRequests: Meter;
    storageMb: Meter;
    bandwidthGb: Meter;
  };
};

export function asNumber(value: unknown): number {
  if (typeof value === 'bigint') return Number(value);
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

export function monthKey(value: unknown): string {
  if (value instanceof Date) return value.toISOString().slice(0, 7);
  if (typeof value === 'string') return value.slice(0, 7);
  return '';
}

export function ageSeconds(from: Date, now = Date.now()): number {
  return Math.max(0, Math.floor((now - from.getTime()) / 1000));
}

export function ratio(used: number, limit: number): number {
  if (limit <= 0) return used > 0 ? 1 : 0;
  return used / limit;
}

function meter(used: number, limit: number): Meter {
  return {
    used,
    limit,
    ratio: ratio(used, limit),
    headroom: limit - used,
  };
}

export function driftFields(
  planId: string,
  entitlements: EntitlementRow | null,
): string[] {
  const plan = PLANS[planId];
  if (!plan) return ['unknown_plan'];
  if (!entitlements) return ['missing_entitlement'];
  const drift: string[] = [];
  if (
    entitlements.limitApplications !== plan.entitlements.limits.applications
  ) {
    drift.push('applications');
  }
  if (entitlements.limitAiRequests !== plan.entitlements.limits.aiRequests) {
    drift.push('aiRequests');
  }
  if (entitlements.limitStorageMb !== plan.entitlements.limits.storageMb) {
    drift.push('storageMb');
  }
  if (entitlements.limitBandwidthGb !== plan.entitlements.limits.bandwidthGb) {
    drift.push('bandwidthGb');
  }
  return drift;
}

export function tenantSignal(row: TenantInput): TenantSignal {
  const entitlements = row.entitlements;
  const counted = row._count.applications;
  const enforced = entitlements?.usageApplications ?? 0;
  const appLimit = entitlements?.limitApplications ?? 0;
  const applications = {
    ...meter(enforced, appLimit),
    counted,
  };
  const ai = meter(
    entitlements?.usageAiRequests ?? 0,
    entitlements?.limitAiRequests ?? 0,
  );
  const storage = meter(
    entitlements?.usageStorageMb ?? 0,
    entitlements?.limitStorageMb ?? 0,
  );
  const usedGb = Math.max(
    entitlements?.usageBandwidthGb ?? 0,
    (entitlements?.usageBandwidthMb ?? 0) / 1024,
  );
  const bandwidth = meter(usedGb, entitlements?.limitBandwidthGb ?? 0);
  const score = Math.max(
    applications.ratio,
    ratio(counted, appLimit),
    ai.ratio,
    storage.ratio,
    bandwidth.ratio,
  );

  return {
    id: row.id,
    name: row.name,
    planId: row.planId,
    subscriptionStatus: row.subscriptionStatus,
    createdAt: row.createdAt.toISOString(),
    drift: driftFields(row.planId, entitlements),
    counterDrift: enforced !== counted,
    score,
    tokens: entitlements?.totalAiTokens ?? 0,
    meters: {
      applications,
      aiRequests: ai,
      storageMb: storage,
      bandwidthGb: bandwidth,
    },
  };
}

export function saturationRank(rows: TenantSignal[]): TenantSignal[] {
  return [...rows].sort((a, b) => {
    const drift = Number(b.drift.length > 0) - Number(a.drift.length > 0);
    if (drift !== 0) return drift;
    if (b.score !== a.score) return b.score - a.score;
    return a.name.localeCompare(b.name);
  });
}

export function contractedMrrCents(
  tenants: Array<{ planId: string; subscriptionStatus: string }>,
): number {
  return tenants.reduce((sum, tenant) => {
    if (
      tenant.subscriptionStatus === 'cancelled' ||
      tenant.subscriptionStatus === 'canceled'
    ) {
      return sum;
    }
    return sum + (PLANS[tenant.planId]?.monthlyPriceCent ?? 0);
  }, 0);
}

const PAYLOAD_KEYS = [
  'from',
  'to',
  'message',
  'planId',
  'provider',
  'status',
  'model',
  'providerEventId',
] as const;

export function compactPayload(
  payload: unknown,
): Record<string, string | number | boolean> | null {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return null;
  }
  const source = payload as Record<string, unknown>;
  const compact: Record<string, string | number | boolean> = {};
  for (const key of PAYLOAD_KEYS) {
    const value = source[key];
    if (typeof value === 'string') compact[key] = value.slice(0, 120);
    else if (typeof value === 'number' || typeof value === 'boolean') {
      compact[key] = value;
    }
  }
  return Object.keys(compact).length ? compact : null;
}

export function compactMetadata(metadata: unknown): unknown {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return null;
  }
  const source = metadata as Record<string, unknown>;
  const compact: Record<string, unknown> = {};
  for (const key of [
    'planId',
    'provider',
    'providerEventId',
    'actorId',
    'source',
    'scanned',
    'upserted',
    'failed',
  ]) {
    const value = source[key];
    if (
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean'
    ) {
      compact[key] = typeof value === 'string' ? value.slice(0, 120) : value;
    }
  }
  if (Array.isArray(source.drift)) {
    compact.drift = source.drift.filter((item) => typeof item === 'string');
  }
  return Object.keys(compact).length ? compact : null;
}
