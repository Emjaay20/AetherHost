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
  region: 'EMEA' | 'AMER' | 'APAC';
  country: string;
  plan: 'Starter' | 'Growth' | 'Scale' | 'Enterprise';
  healthScore: number; // 0 - 100
  healthStatus: CustomerHealthStatus;
  timeToValueMinutes: number;
  onboardingStage: OnboardingStage;
  activeWorkloads: number;
  quotaUtilizationPercent: number;
  recentBuildSuccessRate: number; // 0 - 100
  lastDeploymentAt: string;
  chiliPiperMeetingBooked: boolean;
  lastMeetingNotes?: string;
  sfdcAccountId: string;
  sfdcSyncStatus: 'SYNCED' | 'PENDING' | 'ERROR';
  escalationCount: number;
  assignedCsm: string;
}

export interface PortfolioSummary {
  totalAccounts: number;
  region: string;
  averageHealthScore: number;
  medianTimeToValueMinutes: number;
  expansionReadyCount: number;
  atRiskCount: number;
  chiliPiperBookingsThisMonth: number;
  activeAccounts: CustomerAccountCS[];
}
