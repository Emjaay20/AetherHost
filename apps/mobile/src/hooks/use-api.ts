import { useAuth } from '@clerk/expo';
import { QueryClient, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { aetherApi } from '@/api';

export const queryKeys = {
  applications: ['applications'] as const,
  events: ['events'] as const,
  invoices: ['invoices'] as const,
  apiKeys: ['api-keys'] as const,
  logs: (id: string) => ['applications', id, 'logs'] as const,
  environment: (id: string) => ['applications', id, 'environment'] as const,
  timeline: (id: string) => ['applications', id, 'timeline'] as const,
  domainStatus: (id: string) => ['applications', id, 'domain-status'] as const,
  entitlements: ['entitlements'] as const,
  plans: ['billing-plans'] as const,
  notifications: ['notification-preferences'] as const,
};

async function sessionToken(getToken: () => Promise<string | null>) {
  const token = await getToken();
  if (!token) throw new Error('Your session expired. Please sign in again.');
  return token;
}

export function useApplications() {
  const { getToken } = useAuth();
  return useQuery({ queryKey: queryKeys.applications, queryFn: () => sessionToken(getToken).then(aetherApi.listApplications), staleTime: 20_000 });
}

export function useApplicationLogs(id: string, enabled = true) {
  const { getToken } = useAuth();
  return useQuery({ queryKey: queryKeys.logs(id), queryFn: () => sessionToken(getToken).then((token) => aetherApi.getLogs(id, token)), enabled: Boolean(id) && enabled, refetchInterval: enabled ? 15_000 : false });
}

export function useEnvironment(id: string, enabled = true) {
  const { getToken } = useAuth();
  return useQuery({ queryKey: queryKeys.environment(id), queryFn: () => sessionToken(getToken).then((token) => aetherApi.getEnv(id, token)), enabled: Boolean(id) && enabled, staleTime: 0 });
}

export function useProjectTimeline(id: string, enabled = true) {
  const { getToken } = useAuth();
  return useQuery({ queryKey: queryKeys.timeline(id), queryFn: () => sessionToken(getToken).then((token) => aetherApi.getTimeline(id, token)), enabled: Boolean(id) && enabled, refetchInterval: enabled ? 15_000 : false });
}

export function useDomainStatus(id: string, enabled = true) {
  const { getToken } = useAuth();
  return useQuery({ queryKey: queryKeys.domainStatus(id), queryFn: () => sessionToken(getToken).then((token) => aetherApi.getDomainStatus(id, token)), enabled: Boolean(id) && enabled, refetchInterval: enabled ? 30_000 : false });
}

export function useEvents() {
  const { getToken } = useAuth();
  return useQuery({ queryKey: queryKeys.events, queryFn: () => sessionToken(getToken).then(aetherApi.listEvents), refetchInterval: 30_000 });
}

export function useInvoices() {
  const { getToken } = useAuth();
  return useQuery({ queryKey: queryKeys.invoices, queryFn: () => sessionToken(getToken).then(aetherApi.listInvoices), staleTime: 60_000 });
}

export function usePlans() { const { getToken } = useAuth(); return useQuery({ queryKey: queryKeys.plans, queryFn: () => sessionToken(getToken).then(aetherApi.listPlans), staleTime: 60_000 }); }
export function useEntitlements() { const { getToken } = useAuth(); return useQuery({ queryKey: queryKeys.entitlements, queryFn: () => sessionToken(getToken).then(aetherApi.getEntitlements), staleTime: 30_000 }); }
export function useNotificationPreferences() { const { getToken } = useAuth(); return useQuery({ queryKey: queryKeys.notifications, queryFn: () => sessionToken(getToken).then(aetherApi.getNotificationPreferences), staleTime: 30_000 }); }

export function useApiKeys() {
  const { getToken } = useAuth();
  return useQuery({ queryKey: queryKeys.apiKeys, queryFn: () => sessionToken(getToken).then(aetherApi.listApiKeys), staleTime: 30_000 });
}

export function refreshProjects(client: QueryClient) {
  return client.invalidateQueries({ queryKey: queryKeys.applications });
}

export function useProjectMutations() {
  const { getToken } = useAuth();
  const client = useQueryClient();
  const token = () => sessionToken(getToken);
  return {
    redeploy: useMutation({ mutationFn: (id: string) => token().then((value) => aetherApi.redeploy(id, value)), onSuccess: () => refreshProjects(client) }),
    remove: useMutation({ mutationFn: (id: string) => token().then((value) => aetherApi.deleteApplication(id, value)), onSuccess: () => refreshProjects(client) }),
    updateDomain: useMutation({ mutationFn: ({ id, domain }: { id: string; domain: string | null }) => token().then((value) => aetherApi.updateDomain(id, value, domain)), onSuccess: () => refreshProjects(client) }),
    updateEnvironment: useMutation({ mutationFn: ({ id, envVars, redeploy }: { id: string; envVars: Record<string, string>; redeploy: boolean }) => token().then((value) => aetherApi.updateEnv(id, value, envVars, redeploy)), onSuccess: (_result, variables) => { void client.invalidateQueries({ queryKey: queryKeys.environment(variables.id) }); return refreshProjects(client); } }),
  };
}
