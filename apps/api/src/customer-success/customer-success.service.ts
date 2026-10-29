import { Injectable, Logger } from '@nestjs/common';
import { CustomerAccountCS, CustomerHealthStatus, PortfolioSummary } from './customer-success.types';
import { SalesforceService } from '../integrations/salesforce/salesforce.service';

@Injectable()
export class CustomerSuccessService {
  private readonly logger = new Logger(CustomerSuccessService.name);

  // In-memory portfolio tracking 85+ enterprise customer accounts (EMEA focused)
  private portfolio: Map<string, CustomerAccountCS> = new Map();

  constructor(private readonly salesforceService: SalesforceService) {
    this.seedEmeaPortfolio();
  }

  /**
   * Calculate composite Customer Health Score (0 - 100):
   * - Build Success Rate: 40% weight
   * - Workload Activity & Quota: 30% weight
   * - Onboarding Completion: 20% weight
   * - Absence of Open Escalations: 10% weight
   */
  public calculateHealthScore(account: Partial<CustomerAccountCS>): {
    score: number;
    status: CustomerHealthStatus;
  } {
    const buildWeight = (account.recentBuildSuccessRate ?? 100) * 0.4;
    const quota = account.quotaUtilizationPercent ?? 50;
    
    // Ideal quota is 40%-80%. <10% is inactive, >90% is constrained
    let usageWeight = 30;
    if (quota < 15) usageWeight = 10;
    else if (quota > 95) usageWeight = 15;

    let onboardingWeight = 0;
    switch (account.onboardingStage) {
      case 'ONBOARDING_COMPLETED': onboardingWeight = 20; break;
      case 'CUSTOM_DOMAIN_VERIFIED': onboardingWeight = 15; break;
      case 'FIRST_CONTAINER_DEPLOYED': onboardingWeight = 10; break;
      case 'KICKOFF_SCHEDULED': onboardingWeight = 5; break;
      default: onboardingWeight = 0;
    }

    const escalationPenalty = Math.min((account.escalationCount ?? 0) * 10, 20);
    const rawScore = Math.max(0, Math.min(100, Math.round(buildWeight + usageWeight + onboardingWeight - escalationPenalty)));

    let status: CustomerHealthStatus = 'HEALTHY';
    if (quota >= 80 && rawScore >= 75) {
      status = 'EXPANSION';
    } else if (rawScore < 50 || (account.escalationCount ?? 0) >= 2) {
      status = 'AT_RISK';
    } else if (rawScore < 35) {
      status = 'CRITICAL';
    }

    return { score: rawScore, status };
  }

  /**
   * Returns executive portfolio telemetry for the CSM dashboard.
   */
  public getPortfolioSummary(region = 'EMEA'): PortfolioSummary {
    const accounts = Array.from(this.portfolio.values()).filter(
      (a) => !region || a.region === region
    );

    const totalAccounts = accounts.length;
    const averageHealthScore =
      totalAccounts > 0
        ? Math.round(accounts.reduce((sum, a) => sum + a.healthScore, 0) / totalAccounts)
        : 0;

    const ttvValues = accounts.map((a) => a.timeToValueMinutes).sort((a, b) => a - b);
    const medianTimeToValueMinutes =
      ttvValues.length > 0 ? ttvValues[Math.floor(ttvValues.length / 2)] : 0;

    const expansionReadyCount = accounts.filter((a) => a.healthStatus === 'EXPANSION').length;
    const atRiskCount = accounts.filter((a) => a.healthStatus === 'AT_RISK' || a.healthStatus === 'CRITICAL').length;
    const chiliPiperBookingsThisMonth = accounts.filter((a) => a.chiliPiperMeetingBooked).length;

    return {
      totalAccounts,
      region,
      averageHealthScore,
      medianTimeToValueMinutes,
      expansionReadyCount,
      atRiskCount,
      chiliPiperBookingsThisMonth,
      activeAccounts: accounts,
    };
  }

  public getAccount(id: string): CustomerAccountCS | undefined {
    return this.portfolio.get(id);
  }

  /**
   * Ingests a Chili Piper booking, updates the onboarding stage,
   * logs the meeting in Salesforce, and recalculates account health.
   */
  public async handleChiliPiperMeetingBooked(event: {
    tenantId?: string;
    email: string;
    companyName?: string;
    meetingTime: string;
    routerName: string;
    assigneeEmail: string;
  }): Promise<{ success: boolean; account?: CustomerAccountCS }> {
    this.logger.log(`[Chili Piper Booking Received] ${event.email} scheduled via router: ${event.routerName}`);

    // Find account by tenantId or contactEmail
    let targetAccount = Array.from(this.portfolio.values()).find(
      (a) => (event.tenantId && a.id === event.tenantId) || a.contactEmail.toLowerCase() === event.email.toLowerCase()
    );

    if (!targetAccount) {
      // Create new prospective enterprise account
      const id = `tenant_${Math.random().toString(36).substring(2, 8)}`;
      targetAccount = {
        id,
        name: event.companyName || event.email.split('@')[1] || 'New Enterprise Lead',
        companyDomain: event.email.split('@')[1] || 'example.com',
        contactName: event.email.split('@')[0],
        contactEmail: event.email,
        region: 'EMEA',
        country: 'United Kingdom',
        plan: 'Enterprise',
        healthScore: 85,
        healthStatus: 'HEALTHY',
        timeToValueMinutes: 0,
        onboardingStage: 'KICKOFF_SCHEDULED',
        activeWorkloads: 0,
        quotaUtilizationPercent: 10,
        recentBuildSuccessRate: 100,
        lastDeploymentAt: new Date().toISOString(),
        chiliPiperMeetingBooked: true,
        lastMeetingNotes: `Chili Piper booking confirmed for ${event.meetingTime} with ${event.assigneeEmail}`,
        sfdcAccountId: `001EMEA${Math.random().toString(36).substring(2, 8).toUpperCase()}`,
        sfdcSyncStatus: 'SYNCED',
        escalationCount: 0,
        assignedCsm: event.assigneeEmail || 'csm-emea@aetherhost.io',
      };
      this.portfolio.set(id, targetAccount);
    } else {
      targetAccount.chiliPiperMeetingBooked = true;
      targetAccount.lastMeetingNotes = `Meeting scheduled via ${event.routerName} at ${event.meetingTime}`;
      if (targetAccount.onboardingStage === 'INVITED') {
        targetAccount.onboardingStage = 'KICKOFF_SCHEDULED';
      }
      const recalculated = this.calculateHealthScore(targetAccount);
      targetAccount.healthScore = recalculated.score;
      targetAccount.healthStatus = recalculated.status;
    }

    // Sync task to Salesforce
    await this.salesforceService.createMeetingTask({
      Subject: `Chili Piper Kickoff / CS Session: ${event.email}`,
      ActivityDate: event.meetingTime.split('T')[0] || new Date().toISOString().split('T')[0],
      Status: 'Completed',
      Priority: 'High',
      Description: `Booked via router ${event.routerName}. Customer Email: ${event.email}. Assignee: ${event.assigneeEmail}`,
    });

    return { success: true, account: targetAccount };
  }

  /**
   * Syncs an account manually or on trigger to Salesforce.
   */
  public async syncAccountToSalesforce(accountId: string) {
    const account = this.portfolio.get(accountId);
    if (!account) throw new Error('Account not found');

    const result = await this.salesforceService.syncTenantToSalesforce({
      account: {
        Name: account.name,
        BillingCountry: account.country,
        Type: 'Customer - Direct',
      },
      contact: {
        Email: account.contactEmail,
        FirstName: account.contactName.split(' ')[0] || 'Admin',
        LastName: account.contactName.split(' ')[1] || 'Lead',
      },
      telemetry: {
        Name: account.name,
        Tenant_ID__c: account.id,
        Region__c: account.region,
        Plan_Tier__c: account.plan,
        Customer_Health_Score__c: account.healthScore,
        Time_To_Value_Minutes__c: account.timeToValueMinutes,
        Active_Workloads_Count__c: account.activeWorkloads,
        Monthly_Bandwidth_GB__c: Math.round(account.quotaUtilizationPercent * 5),
        Quota_Utilization_Percent__c: account.quotaUtilizationPercent,
        Last_Deployment_Status__c: account.recentBuildSuccessRate > 80 ? 'SUCCESS' : 'FAILED',
        Churn_Risk_Flag__c: account.healthStatus === 'AT_RISK' || account.healthStatus === 'CRITICAL',
        Expansion_Ready__c: account.healthStatus === 'EXPANSION',
        Chili_Piper_Meeting_Booked__c: account.chiliPiperMeetingBooked,
      },
    });

    account.sfdcSyncStatus = 'SYNCED';
    return result;
  }

  /**
   * Seeds an initial realistic portfolio of 85 EMEA Enterprise Accounts
   * to demonstrate managing a high-volume portfolio.
   */
  private seedEmeaPortfolio() {
    const emeaAccounts: Array<Partial<CustomerAccountCS>> = [
      {
        id: 'tenant_fintech_uk',
        name: 'PayBridge UK Ltd',
        companyDomain: 'paybridge.co.uk',
        contactName: 'Oliver Smith',
        contactEmail: 'oliver@paybridge.co.uk',
        region: 'EMEA',
        country: 'United Kingdom',
        plan: 'Enterprise',
        timeToValueMinutes: 2.8,
        onboardingStage: 'ONBOARDING_COMPLETED',
        activeWorkloads: 24,
        quotaUtilizationPercent: 88, // Expansion trigger!
        recentBuildSuccessRate: 98,
        chiliPiperMeetingBooked: true,
        escalationCount: 0,
        assignedCsm: 'Senior CSM (EMEA)',
      },
      {
        id: 'tenant_retail_de',
        name: 'ZalFlow Retail GmbH',
        companyDomain: 'zalflow.de',
        contactName: 'Maximilian Bauer',
        contactEmail: 'm.bauer@zalflow.de',
        region: 'EMEA',
        country: 'Germany',
        plan: 'Scale',
        timeToValueMinutes: 3.4,
        onboardingStage: 'ONBOARDING_COMPLETED',
        activeWorkloads: 14,
        quotaUtilizationPercent: 62,
        recentBuildSuccessRate: 94,
        chiliPiperMeetingBooked: true,
        escalationCount: 0,
        assignedCsm: 'Senior CSM (EMEA)',
      },
      {
        id: 'tenant_health_se',
        name: 'NordicPulse Health AB',
        companyDomain: 'nordicpulse.se',
        contactName: 'Astrid Lindgren',
        contactEmail: 'astrid@nordicpulse.se',
        region: 'EMEA',
        country: 'Sweden',
        plan: 'Growth',
        timeToValueMinutes: 4.1,
        onboardingStage: 'CUSTOM_DOMAIN_VERIFIED',
        activeWorkloads: 6,
        quotaUtilizationPercent: 35,
        recentBuildSuccessRate: 65, // At risk!
        chiliPiperMeetingBooked: false,
        escalationCount: 2,
        assignedCsm: 'Senior CSM (EMEA)',
      },
      {
        id: 'tenant_logistics_nl',
        name: 'PortSmart Logistics B.V.',
        companyDomain: 'portsmart.nl',
        contactName: 'Daan van Dijk',
        contactEmail: 'daan@portsmart.nl',
        region: 'EMEA',
        country: 'Netherlands',
        plan: 'Scale',
        timeToValueMinutes: 2.5,
        onboardingStage: 'ONBOARDING_COMPLETED',
        activeWorkloads: 18,
        quotaUtilizationPercent: 82, // Expansion trigger
        recentBuildSuccessRate: 100,
        chiliPiperMeetingBooked: true,
        escalationCount: 0,
        assignedCsm: 'Senior CSM (EMEA)',
      },
      {
        id: 'tenant_cloudops_fr',
        name: 'AzurData Solutions SAS',
        companyDomain: 'azurdata.fr',
        contactName: 'Camille Dubois',
        contactEmail: 'camille@azurdata.fr',
        region: 'EMEA',
        country: 'France',
        plan: 'Starter',
        timeToValueMinutes: 6.2,
        onboardingStage: 'FIRST_CONTAINER_DEPLOYED',
        activeWorkloads: 2,
        quotaUtilizationPercent: 12,
        recentBuildSuccessRate: 40, // Critical
        chiliPiperMeetingBooked: false,
        escalationCount: 3,
        assignedCsm: 'Senior CSM (EMEA)',
      },
    ];

    // Add seed accounts
    for (const raw of emeaAccounts) {
      const calc = this.calculateHealthScore(raw);
      const acc: CustomerAccountCS = {
        id: raw.id!,
        name: raw.name!,
        companyDomain: raw.companyDomain!,
        contactName: raw.contactName!,
        contactEmail: raw.contactEmail!,
        region: raw.region as any,
        country: raw.country!,
        plan: raw.plan as any,
        healthScore: calc.score,
        healthStatus: calc.status,
        timeToValueMinutes: raw.timeToValueMinutes!,
        onboardingStage: raw.onboardingStage as any,
        activeWorkloads: raw.activeWorkloads!,
        quotaUtilizationPercent: raw.quotaUtilizationPercent!,
        recentBuildSuccessRate: raw.recentBuildSuccessRate!,
        lastDeploymentAt: new Date(Date.now() - Math.floor(Math.random() * 86400000 * 3)).toISOString(),
        chiliPiperMeetingBooked: raw.chiliPiperMeetingBooked!,
        sfdcAccountId: `001EMEA${Math.random().toString(36).substring(2, 8).toUpperCase()}`,
        sfdcSyncStatus: 'SYNCED',
        escalationCount: raw.escalationCount!,
        assignedCsm: raw.assignedCsm!,
      };
      this.portfolio.set(acc.id, acc);
    }

    // Populate remaining cohort up to 85 accounts across EMEA
    const countries = ['United Kingdom', 'Germany', 'France', 'Netherlands', 'Ireland', 'Spain', 'Switzerland', 'Sweden'];
    const plans: Array<'Starter' | 'Growth' | 'Scale' | 'Enterprise'> = ['Starter', 'Growth', 'Scale', 'Enterprise'];
    for (let i = 6; i <= 85; i++) {
      const country = countries[i % countries.length];
      const plan = plans[i % plans.length];
      const id = `tenant_emea_${i}`;
      const quota = 20 + ((i * 13) % 75);
      const buildRate = 80 + ((i * 7) % 21);
      const stage: CustomerAccountCS['onboardingStage'] =
        i % 7 === 0 ? 'KICKOFF_SCHEDULED' : i % 5 === 0 ? 'CUSTOM_DOMAIN_VERIFIED' : 'ONBOARDING_COMPLETED';

      const draft: Partial<CustomerAccountCS> = {
        quotaUtilizationPercent: quota,
        recentBuildSuccessRate: buildRate,
        onboardingStage: stage,
        escalationCount: i % 11 === 0 ? 1 : 0,
      };

      const { score, status } = this.calculateHealthScore(draft);

      const acc: CustomerAccountCS = {
        id,
        name: `EMEA Enterprise Corp ${i}`,
        companyDomain: `corp${i}.eu`,
        contactName: `Tech Lead ${i}`,
        contactEmail: `lead${i}@corp${i}.eu`,
        region: 'EMEA',
        country,
        plan,
        healthScore: score,
        healthStatus: status,
        timeToValueMinutes: +(2.0 + (i % 30) / 10).toFixed(1),
        onboardingStage: stage,
        activeWorkloads: 3 + (i % 18),
        quotaUtilizationPercent: quota,
        recentBuildSuccessRate: buildRate,
        lastDeploymentAt: new Date(Date.now() - (i % 7) * 86400000).toISOString(),
        chiliPiperMeetingBooked: i % 3 === 0,
        sfdcAccountId: `001EMEA${i.toString().padStart(5, '0')}`,
        sfdcSyncStatus: 'SYNCED',
        escalationCount: draft.escalationCount!,
        assignedCsm: 'Senior CSM (EMEA)',
      };

      this.portfolio.set(id, acc);
    }
  }
}
