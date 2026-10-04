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

