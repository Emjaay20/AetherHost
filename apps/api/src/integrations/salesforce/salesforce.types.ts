/**
 * Salesforce Integration Data Types & Schema Definitions
 * Covers Standard Objects (Account, Contact, Opportunity, Task) and Custom Objects (Aether_Tenant__c)
 */

export interface SFDCStandardAccount {
  Id?: string;
  Name: string;
  BillingCountry: string; // Used for EMEA territory routing
  BillingCity?: string;
  Industry?: string;
  AnnualRevenue?: number;
  NumberOfEmployees?: number;
  Type: 'Customer - Direct' | 'Customer - Channel' | 'Prospect';
  Description?: string;
}

export interface SFDCStandardContact {
  Id?: string;
  AccountId?: string;
  Email: string;
  FirstName: string;
  LastName: string;
  Title?: string;
  Phone?: string;
  LeadSource?: string;
}

export interface SFDCStandardOpportunity {
  Id?: string;
  AccountId: string;
  Name: string;
  StageName: 'Prospecting' | 'Qualification' | 'Value Proposition' | 'Proposal/Price Quote' | 'Closed Won' | 'Closed Lost';
  Amount: number;
  CloseDate: string; // YYYY-MM-DD
  Type: 'New Customer' | 'Existing Customer - Upgrade' | 'Existing Customer - Replacement';
  Description?: string;
}

export interface SFDCStandardTask {
  Id?: string;
  WhoId?: string; // Contact or Lead ID
  WhatId?: string; // Account or Opportunity ID
  Subject: string;
  ActivityDate: string;
  Status: 'Not Started' | 'In Progress' | 'Completed' | 'Deferred';
  Priority: 'High' | 'Normal' | 'Low';
  Description?: string;
}

/**
 * Custom Salesforce Object: Aether_Tenant__c
 * Matches enterprise managed package conventions for PaaS telemetry sync.
 */
export interface SFDCAetherTenantCustomObject {
  Id?: string;
  Name: string;
  Account__c?: string;
  Tenant_ID__c: string;
  Region__c: 'EMEA' | 'AMER' | 'APAC';
  Plan_Tier__c: 'Starter' | 'Growth' | 'Scale' | 'Enterprise';
  Customer_Health_Score__c: number; // 0 - 100
  Time_To_Value_Minutes__c: number;
  Active_Workloads_Count__c: number;
  Monthly_Bandwidth_GB__c: number;
  Quota_Utilization_Percent__c: number;
  Last_Deployment_Status__c: 'SUCCESS' | 'FAILED' | 'PENDING';
  Churn_Risk_Flag__c: boolean;
  Expansion_Ready__c: boolean;
  Chili_Piper_Meeting_Booked__c: boolean;
}

export interface SFDCOAuthTokenResponse {
  access_token: string;
  instance_url: string;
  id: string;
  token_type: string;
  issued_at: string;
  signature: string;
}

export interface SFDCSyncResult {
  success: boolean;
  salesforceAccountId?: string;
  salesforceCustomObjectId?: string;
  syncTimestamp: string;
  message?: string;
}
