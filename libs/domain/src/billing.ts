export interface CatalogPlan {
  id: string;
  name: string;
  limits: {
    applications: number;
    aiRequests: number;
  };
}

export const PLANS: Record<string, CatalogPlan> = {
  starter: {
    id: 'starter',
    name: 'Starter Plan',
    limits: {
      applications: 3,
      aiRequests: 2,
    },
  },
  growth: {
    id: 'growth',
    name: 'Growth Plan',
    limits: {
      applications: 10,
      aiRequests: 100,
    },
  },
};
