export type CustomerHealthStatus = 'HEALTHY' | 'EXPANSION' | 'AT_RISK' | 'CRITICAL';

export type OnboardingStage =
  | 'INVITED'
  | 'KICKOFF_SCHEDULED'
  | 'FIRST_CONTAINER_DEPLOYED'
  | 'CUSTOM_DOMAIN_VERIFIED'
  | 'ONBOARDING_COMPLETED';

export interface CustomerAccountCS {
  id: string;
  name: string;
  companyDomain: string;
  contactName: string;
  contactEmail: string;
  region: string;
  country: string;
  plan: string;
  healthScore: number; // 0 - 100
  healthStatus: CustomerHealthStatus;
  timeToValueMinutes: number | null;
  onboardingStage: OnboardingStage;
  activeWorkloads: number;
  totalWorkloads: number;
  quotaUtilizationPercent: number;
  recentBuildSuccessRate: number; // 0 - 100
  lastDeploymentAt: string | null;
  chiliPiperMeetingBooked: boolean;
  sfdcAccountId: string | null;
  sfdcSyncStatus: 'SYNCED' | 'NOT_CONFIGURED' | 'ERROR';
  escalationCount: number;
  assignedCsm: string;
  createdAt: string;
}

export interface PortfolioSummary {
  totalAccounts: number;
  averageHealthScore: number;
  medianTimeToValueMinutes: number | null;
  expansionReadyCount: number;
  atRiskCount: number;
  chiliPiperBookingsThisMonth: number;
  integrations: {
    salesforce: { configured: boolean; instanceUrl?: string };
    chiliPiper: { configured: boolean; domain?: string; router?: string };
  };
  activeAccounts: CustomerAccountCS[];
}
