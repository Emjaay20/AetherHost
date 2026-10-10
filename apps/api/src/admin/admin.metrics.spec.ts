import {
  asNumber,
  compactPayload,
  contractedMrrCents,
  driftFields,
  saturationRank,
  tenantSignal,
  type TenantInput,
} from './admin.metrics';

function tenant(overrides: Partial<TenantInput> = {}): TenantInput {
  return {
    id: 'user_1',
    name: 'Acme',
    planId: 'pro',
    subscriptionStatus: 'active',
    createdAt: new Date('2026-10-01T00:00:00.000Z'),
    entitlements: {
      limitApplications: 5,
      limitAiRequests: 50,
      limitStorageMb: 2048,
      limitBandwidthGb: 10,
      usageApplications: 4,
      usageAiRequests: 10,
      usageStorageMb: 100,
      usageBandwidthMb: 2048,
      usageBandwidthGb: 0,
      totalAiTokens: 1200,
    },
    _count: { applications: 4 },
    ...overrides,
  };
}

describe('admin metrics', () => {
  it('converts bigint sums from analytics views', () => {
    expect(asNumber(2500n)).toBe(2500);
    expect(asNumber('12')).toBe(12);
  });

  it('flags catalog drift, including bandwidth applyPlan used to skip', () => {
    expect(driftFields('pro', tenant().entitlements)).toEqual(['bandwidthGb']);
    expect(
      driftFields('pro', {
        ...tenant().entitlements!,
        limitBandwidthGb: 50,
      }),
    ).toEqual([]);
    expect(driftFields('growth', null)).toEqual(['unknown_plan']);
  });

  it('scores saturation from the enforced counter and observed rows', () => {
    const signal = tenantSignal(
      tenant({
        entitlements: {
          ...tenant().entitlements!,
          usageApplications: 1,
        },
        _count: { applications: 5 },
      }),
    );
    expect(signal.counterDrift).toBe(true);
    expect(signal.score).toBe(1);
    expect(signal.meters.bandwidthGb.used).toBe(2);
  });

  it('ranks drifted tenants ahead of healthy ones', () => {
    const drifted = tenantSignal(tenant({ id: 'b', name: 'B' }));
    const healthy = tenantSignal(
      tenant({
        id: 'a',
        name: 'A',
        entitlements: {
          ...tenant().entitlements!,
          limitBandwidthGb: 50,
          usageApplications: 5,
        },
      }),
    );
    expect(saturationRank([healthy, drifted]).map((row) => row.id)).toEqual([
      'b',
      'a',
    ]);
  });

  it('excludes cancelled tenants from contracted MRR', () => {
    expect(
      contractedMrrCents([
        { planId: 'pro', subscriptionStatus: 'active' },
        { planId: 'max', subscriptionStatus: 'cancelled' },
        { planId: 'starter', subscriptionStatus: 'past_due' },
      ]),
    ).toBe(1000);
  });

  it('drops prompt and model output from event payloads', () => {
    expect(
      compactPayload({
        from: 'pending',
        to: 'running',
        output: 'secret completion',
        prompt: 'do not show',
      }),
    ).toEqual({ from: 'pending', to: 'running' });
  });
});
