export interface RuntimeProvisioner {
  provision(applicationId: string, tenantId: string, runtime: string): Promise<{ ok: boolean; message: string }>;
}
