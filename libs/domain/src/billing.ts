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
    applications: 1,
    aiRequests: 10,
    storageMb: 512,
    bandwidthGb: 10,
  },
  features: {
    customDomains: false,
    prioritySupport: false,
  },
};

export const PRO_ENTITLEMENTS: Entitlements = {
  limits: {
    applications: 5,
    aiRequests: 50,
    storageMb: 2048,
    bandwidthGb: 50,
  },
  features: {
    customDomains: true,
    prioritySupport: false,
  },
};

export const MAX_ENTITLEMENTS: Entitlements = {
  limits: {
    applications: 20,
    aiRequests: 200,
    storageMb: 10240,
    bandwidthGb: 500,
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
  pro: {
    id: 'pro',
    name: 'Pro',
    monthlyPriceCent: 1000, // $10.00
    entitlements: PRO_ENTITLEMENTS,
  },
  max: {
    id: 'max',
    name: 'Max',
    monthlyPriceCent: 2500, // $25.00
    entitlements: MAX_ENTITLEMENTS,
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
