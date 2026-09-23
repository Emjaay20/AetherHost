import { Runtime } from './enums';

export interface Tenant {
  id: string;
  name: string;
  planId: string;
}

export interface Plan {
  id: string;
  name: string;
  maxApplications: number;
}

export interface Application {
  id: string;
  tenantId: string;
  name: string;
  runtime: Runtime;
  status: 'pending' | 'provisioning' | 'running' | 'failed';
}

export interface SLO {
  metric: string;
  targetPercentage: number;
  errorBudget: number;
}
