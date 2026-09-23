export type EntitlementAction = 'application.create' | 'application.deploy' | 'ai.request' | 'domain.attach';

export interface TenantEntitlements {
  limits: {
    applications: number;
    aiRequests: number;
  };
  usage: {
    applications: number;
    aiRequests: number;
  };
}

export const STARTER_ENTITLEMENTS: TenantEntitlements = {
  limits: {
    applications: 3,
    aiRequests: 2,
  },
  usage: {
    applications: 0,
    aiRequests: 0,
  },
};
