export interface Entitlements {
  limits: {
    applications: number;
    aiRequests: number;
    storageMb: number;
    bandwidthGb: number;
  };
  features: {
    customDomains: boolean;
    prioritySupport: boolean;
  };
}

export interface CatalogPlan {
  id: string;
  name: string;
  monthlyPriceCent: number;
  entitlements: Entitlements;
}

export const STARTER_ENTITLEMENTS: Entitlements = {
  limits: {
    applications: 3,
    aiRequests: 10,
    storageMb: 512,
    bandwidthGb: 10, // 10 GB per month
  },
  features: {
    customDomains: false,
    prioritySupport: false,
  },
};

export const GROWTH_ENTITLEMENTS: Entitlements = {
  limits: {
    applications: 15,
    aiRequests: 100,
    storageMb: 5120,
    bandwidthGb: 100, // 100 GB per month
  },
  features: {
    customDomains: true,
    prioritySupport: true,
  },
};

export const PLANS: Record<string, CatalogPlan> = {
  starter: {
    id: 'starter',
    name: 'Starter',
    monthlyPriceCent: 0,
    entitlements: STARTER_ENTITLEMENTS,
  },
  growth: {
    id: 'growth',
    name: 'Growth',
    monthlyPriceCent: 4900,
    entitlements: GROWTH_ENTITLEMENTS,
  },
};

export interface TenantEntitlementsView {
  tenantId: string;
  planId: string;
  subscriptionStatus: string;
  limits: {
    applications: number;
    aiRequests: number;
    storageMb: number;
    bandwidthMb: number;
  };
  usage: {
    applications: number;
    aiRequests: number;
    storageMb: number;
    bandwidthMb: number;
  };
  metrics: {
    totalAiTokens: number;
    currentMemoryMb: number;
  };
}
