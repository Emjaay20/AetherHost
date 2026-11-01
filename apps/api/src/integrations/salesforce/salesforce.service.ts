import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  SFDCStandardAccount,
  SFDCStandardContact,
  SFDCStandardOpportunity,
  SFDCStandardTask,
  SFDCAetherTenantCustomObject,
  SFDCSyncResult,
} from './salesforce.types';

@Injectable()
export class SalesforceService {
  private readonly logger = new Logger(SalesforceService.name);
  private accessToken: string | null = null;
  private instanceUrl: string | null = null;
  private tokenExpiresAt: number = 0;

  constructor(private readonly config: ConfigService) {}

  public isConfigured(): boolean {
    const clientId = this.config.get<string>('SALESFORCE_CLIENT_ID');
    const clientSecret = this.config.get<string>('SALESFORCE_CLIENT_SECRET');
    return Boolean(clientId && clientSecret);
  }

  public getInstanceUrl(): string | undefined {
    return this.instanceUrl || this.config.get<string>('SALESFORCE_INSTANCE_URL');
  }

  /**
   * Retrieves or refreshes an OAuth2 access token for the Salesforce REST API.
   * If credentials are not configured, returns null without faking tokens.
   */
  private async getAccessToken(): Promise<{ token: string; instanceUrl: string } | null> {
    const clientId = this.config.get<string>('SALESFORCE_CLIENT_ID');
    const clientSecret = this.config.get<string>('SALESFORCE_CLIENT_SECRET');
    const loginUrl = this.config.get<string>('SALESFORCE_LOGIN_URL', 'https://login.salesforce.com');

    if (!clientId || !clientSecret) {
      return null;
    }

    if (this.accessToken && this.instanceUrl && Date.now() < this.tokenExpiresAt - 60000) {
      return { token: this.accessToken || '', instanceUrl: this.instanceUrl || '' };
    }

    try {
      const params = new URLSearchParams();
      params.append('grant_type', 'client_credentials');
      params.append('client_id', clientId);
      params.append('client_secret', clientSecret);

      const res = await fetch(`${loginUrl}/services/oauth2/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString(),
      });

      if (!res.ok) {
        throw new Error(`SFDC Auth Failed: ${res.status} ${res.statusText}`);
      }

      const data = await res.json();
      this.accessToken = data.access_token;
      this.instanceUrl = data.instance_url;
      this.tokenExpiresAt = Date.now() + 3600 * 1000;

      return { token: this.accessToken || '', instanceUrl: this.instanceUrl || '' };
    } catch (err: any) {
      this.logger.error(`Failed to authenticate with Salesforce REST API: ${err.message}`);
      return null;
    }
  }

  /**
   * Syncs an entire Tenant to Salesforce via REST API.
   * Only executes if real Salesforce credentials are configured.
   */
  async syncTenantToSalesforce(payload: {
    account: SFDCStandardAccount;
    contact: SFDCStandardContact;
    telemetry: Omit<SFDCAetherTenantCustomObject, 'Id'>;
  }): Promise<SFDCSyncResult> {
    const auth = await this.getAccessToken();
    if (!auth) {
      return {
        success: false,
        syncTimestamp: new Date().toISOString(),
        message: 'Salesforce integration unconfigured. Set SALESFORCE_CLIENT_ID and SALESFORCE_CLIENT_SECRET in environment variables to enable live CRM sync.',
      };
    }

    try {
      // Upsert Account via Salesforce REST API
      const accountRes = await fetch(`${auth.instanceUrl}/services/data/v59.0/sobjects/Account`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${auth.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload.account),
      });

      const accountData = await accountRes.json();
      const accountId = accountData.id;

      // Upsert Custom Object Aether_Tenant__c
      const customRes = await fetch(`${auth.instanceUrl}/services/data/v59.0/sobjects/Aether_Tenant__c`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${auth.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...payload.telemetry,
          Account__c: accountId,
        }),
      });

      const customData = await customRes.json();

      return {
        success: true,
        salesforceAccountId: accountId,
        salesforceCustomObjectId: customData.id,
        syncTimestamp: new Date().toISOString(),
        message: `Synced tenant to Salesforce Account (${accountId}) and Aether_Tenant__c (${customData.id}).`,
      };
    } catch (err: any) {
      this.logger.error(`Salesforce sync error: ${err.message}`);
      return {
        success: false,
        syncTimestamp: new Date().toISOString(),
        message: `Salesforce API sync error: ${err.message}`,
      };
    }
  }

  /**
   * Records a task in Salesforce if configured.
   */
  async createMeetingTask(task: SFDCStandardTask): Promise<{ success: boolean; taskId?: string; message?: string }> {
    const auth = await this.getAccessToken();
    if (!auth) {
      return {
        success: false,
        message: 'Salesforce not configured.',
      };
    }

    try {
      const res = await fetch(`${auth.instanceUrl}/services/data/v59.0/sobjects/Task`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${auth.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(task),
      });
      const data = await res.json();
      return { success: true, taskId: data.id };
    } catch (err: any) {
      return { success: false, message: err.message };
    }
  }

  /**
   * Flags an Expansion Opportunity for the Account Executive (AE) team.
   */
  async createExpansionOpportunity(opportunity: SFDCStandardOpportunity): Promise<{ success: boolean; opportunityId?: string; message?: string }> {
    const auth = await this.getAccessToken();
    if (!auth) {
      return {
        success: false,
        message: 'Salesforce unconfigured. Configure SALESFORCE_CLIENT_ID to push opportunities directly to Salesforce.',
      };
    }

    try {
      const res = await fetch(`${auth.instanceUrl}/services/data/v59.0/sobjects/Opportunity`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${auth.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(opportunity),
      });
      const data = await res.json();
      return { success: true, opportunityId: data.id };
    } catch (err: any) {
      return { success: false, message: err.message };
    }
  }
}
