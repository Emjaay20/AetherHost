import { z } from 'zod';

export const applicationSchema = z.object({
  id: z.string(), name: z.string(), safeName: z.string().optional(), runtime: z.string().catch('application'),
  status: z.string().catch('pending'), githubRepo: z.string().nullable().optional(), customDomain: z.string().nullable().optional(),
  envVars: z.record(z.string(), z.string()).nullable().optional(), createdAt: z.string().optional(), updatedAt: z.string().optional(),
}).passthrough();
export type Application = z.infer<typeof applicationSchema>;

export const applicationLogSchema = z.object({
  id: z.string().optional(), log: z.string().optional(), logContent: z.string().optional(), createdAt: z.string().optional(),
}).passthrough();
export type ApplicationLog = z.infer<typeof applicationLogSchema>;

export type DomainEvent = { id?: string; type?: string; eventType?: string; message?: string; payload?: unknown; createdAt?: string };
export type ApiKey = { id: string; name?: string | null; keyPrefix?: string | null; createdAt?: string; lastUsedAt?: string | null };
export type Invoice = { id: string; amount?: number; amountCent?: number; currency?: string; status?: string; createdAt?: string; planId?: string };
export type InvoicePage = { data: Invoice[]; meta: { total: number; skip: number; take: number; hasMore: boolean } };
export type TimelineEntry = { id: string; kind: 'log' | 'event'; message: string; eventName?: string; createdAt: string };
export type DomainStatus = { configured: boolean; domain?: string; expectedIp?: string; addresses?: string[]; dns: string; ssl: string; reprovisioning?: boolean };
export type Entitlements = { planId: string; subscriptionStatus: string; limits: Record<string, number>; usage: Record<string, number>; metrics: Record<string, number> };
export type BillingPlan = { id: string; name?: string; monthlyPriceCent?: number; currency?: string; entitlements?: { limits?: Record<string, number> } };
export type NotificationPreferences = { enabled: boolean; devices: { id: string; platform: string; enabled: boolean; updatedAt: string }[] };

const apiUrl = (process.env.EXPO_PUBLIC_API_URL || '').replace(/\/$/, '');

function requireApiUrl() {
  if (!apiUrl) {
    throw new Error('Add EXPO_PUBLIC_API_URL to your .env file before connecting AetherHost Mobile.');
  }
  return apiUrl;
}

async function request<T>(path: string, token: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${requireApiUrl()}${path}`, {
    ...init,
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...init?.headers,
    },
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null) as { message?: string | string[] } | null;
    const message = Array.isArray(body?.message) ? body.message.join(', ') : body?.message;
    throw new Error(message || `AetherHost could not complete that request (${response.status}).`);
  }

  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export const aetherApi = {
  listApplications: async (token: string) => applicationSchema.array().parse(await request<unknown>('/v1/applications', token)),
  getLogs: async (id: string, token: string) => applicationLogSchema.array().parse(await request<unknown>(`/v1/applications/${id}/logs`, token)),
  getTimeline: (id: string, token: string) => request<TimelineEntry[]>(`/v1/applications/${id}/timeline`, token),
  getDomainStatus: (id: string, token: string) => request<DomainStatus>(`/v1/applications/${id}/domain-status`, token),
  redeploy: (id: string, token: string) =>
    request<unknown>(`/v1/applications/${id}/redeploy`, token, { method: 'POST', body: '{}' }).then(applicationSchema.parse),
  deleteApplication: (id: string, token: string) =>
    request<void>(`/v1/applications/${id}`, token, { method: 'DELETE' }),
  getEnv: (id: string, token: string) => request<{ envVars: Record<string, string> }>(`/v1/applications/${id}/env`, token),
  updateEnv: (id: string, token: string, envVars: Record<string, string>, redeploy: boolean) =>
    request<{ success: boolean; envVars: Record<string, string> }>(`/v1/applications/${id}/env`, token, { method: 'PATCH', body: JSON.stringify({ envVars, redeploy }) }),
  updateDomain: (id: string, token: string, customDomain: string | null) =>
    request<{ success: boolean; customDomain: string | null }>(`/v1/applications/${id}/domain`, token, { method: 'PATCH', body: JSON.stringify({ customDomain }) }),
  listEvents: (token: string) => request<DomainEvent[]>('/v1/events', token),
  listApiKeys: (token: string) => request<ApiKey[]>('/v1/api-keys', token),
  createApiKey: (token: string, name: string) => request<ApiKey & { key?: string; secret?: string }>('/v1/api-keys', token, { method: 'POST', body: JSON.stringify({ name }) }),
  revokeApiKey: (id: string, token: string) => request<void>(`/v1/api-keys/${id}`, token, { method: 'DELETE' }),
  listInvoices: (token: string) => request<InvoicePage>('/v1/billing/invoices', token),
  listPlans: (token: string) => request<BillingPlan[]>('/v1/billing/plans', token),
  getEntitlements: (token: string) => request<Entitlements>('/v1/entitlements', token),
  createCheckout: (token: string, planId: string) => request<{ checkoutUrl: string }>('/v1/billing/checkout', token, { method: 'POST', body: JSON.stringify({ planId, provider: 'bachs' }) }),
  getOpsInsight: (token: string, applicationId: string) => request<{ output?: string; insight?: string }>('/v1/ai/insights/ops', token, { method: 'POST', body: JSON.stringify({ applicationId }) }),
  getNotificationPreferences: (token: string) => request<NotificationPreferences>('/v1/notifications/preferences', token),
  registerPushDevice: (token: string, pushToken: string, platform: 'ios' | 'android') => request<void>('/v1/notifications/devices', token, { method: 'POST', body: JSON.stringify({ token: pushToken, platform }) }),
  updateNotificationPreferences: (token: string, enabled: boolean) => request<NotificationPreferences>('/v1/notifications/preferences', token, { method: 'PATCH', body: JSON.stringify({ enabled }) }),
  iterateWithAi: (id: string, token: string, prompt: string) =>
    request<{ summary?: string; commitMessage?: string }>(`/v1/ai/applications/${id}/iterate`, token, {
      method: 'POST',
      body: JSON.stringify({ prompt }),
    }),
  createFromPrompt: (token: string, prompt: string, repositoryName?: string) =>
    request<Application>('/v1/ai/provision', token, {
      method: 'POST',
      body: JSON.stringify({ prompt, repositoryName, generateDescription: true }),
    }),
};
