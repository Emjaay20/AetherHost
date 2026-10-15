import { getApplications, getEntitlements, getEvents, runProvisioner, deleteApplication } from '../../actions'
import CreateAppForm from '../../../components/CreateAppForm'
import EventsPanel from '../../../components/EventsPanel'
import OpsInsightPanel from '../../../components/OpsInsightPanel'
import AiProvisioningPrompt from '../../../components/AiProvisioningPrompt'
import AutoRefresh from '../../../components/AutoRefresh'
import ApplicationCardItem, { type ApplicationItem } from '../../../components/ApplicationCardItem'
import AppShell from '../../../components/AppShell'
import { Server, Activity, Box, HardDrive } from 'lucide-react'
import { UserButton, Show, SignInButton } from "@clerk/nextjs";
import Link from 'next/link';
import { cookies } from 'next/headers';
import { stopImpersonating } from '../../admin/actions';

import { isCurrentUserAdmin } from '../../../lib/admin'

export default async function Dashboard() {
  const cookieStore = await cookies();
  const impersonateTenantId = cookieStore.get('aether_impersonate_tenant')?.value;
  const impersonateTenantName = cookieStore.get('aether_impersonate_tenant_name')?.value;

  const [apps, entitlements, events, isAdmin] = await Promise.all([
    getApplications(),
    getEntitlements(),
    getEvents(),
    isCurrentUserAdmin(),
  ])
  
  const usage = Math.max(apps.length, entitlements?.usage?.applications || 0)
  const limit = entitlements?.limits?.applications || 3
  const limitReached = usage >= limit
  const percentUsed = Math.min((usage / limit) * 100, 100)
  
  const storageUsage = entitlements?.usage?.storageMb || 0
  const storageLimit = entitlements?.limits?.storageMb || 512
  const storagePercent = Math.min((storageUsage / storageLimit) * 100, 100)

  const planId = entitlements?.planId || 'starter'

  return (
    <AppShell
      usage={usage}
      limit={limit}
      activePath="/console"
      planId={planId}
      isAdmin={isAdmin}
      title="Overview"
      crumb="workspace"
      banner={
        impersonateTenantId ? (
          <div className="flex flex-col gap-2 border-b border-amber-500/30 bg-amber-500/15 px-4 py-2.5 text-xs text-amber-300 sm:flex-row sm:items-center sm:justify-between sm:px-8">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <span className="rounded border border-amber-500/40 bg-amber-500/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider">
                Impersonating
              </span>
              <span className="min-w-0 break-all">
                Operating as <strong>{impersonateTenantName || impersonateTenantId}</strong> ({impersonateTenantId})
              </span>
            </div>
            <form action={stopImpersonating}>
              <button
                type="submit"
                className="rounded-lg border border-amber-500/40 bg-amber-500/20 px-3 py-1 text-xs font-medium text-amber-200 transition-colors hover:bg-amber-500/30"
              >
                Exit Impersonation
              </button>
            </form>
          </div>
        ) : null
      }
      actions={
        <>
          <Link
            href="/billing"
            className="whitespace-nowrap rounded-lg border border-primary/20 bg-primary/10 px-2.5 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-primary/20"
          >
            <span className="hidden sm:inline">Current Plan: </span>
            {planId.toUpperCase()}
          </Link>
          <form action={runProvisioner}>
            <button
              type="submit"
              className="whitespace-nowrap rounded-lg border border-border/50 bg-muted px-3 py-2 text-sm font-medium text-muted-foreground shadow-sm transition-all duration-200 hover:bg-muted/80 hover:text-foreground active:scale-95"
            >
              <span className="sm:hidden">Provision</span>
              <span className="hidden sm:inline">Run Provisioner</span>
            </button>
          </form>
          <CreateAppForm limitReached={limitReached} />
          <Show when="signed-in">
            <UserButton />
          </Show>
          <Show when="signed-out">
            <SignInButton mode="modal">
              <button className="rounded-lg border border-primary/50 bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm transition-all duration-200 hover:bg-primary/90 active:scale-95">
                Sign In
              </button>
            </SignInButton>
          </Show>
        </>
      }
    >
      <AutoRefresh interval={8000} />
      <div className="mx-auto max-w-6xl space-y-8 animate-in fade-in duration-500">
            
            {/* Stats Grid */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
              
              <div className="p-5 rounded-2xl bg-card border border-border/50 shadow-sm relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-green-500/5 rounded-full blur-3xl -mr-10 -mt-10" />
                <div className="flex items-center gap-3 text-muted-foreground mb-4">
                  <Server className="w-4 h-4" />
                  <h3 className="text-sm font-medium">Active Deployments</h3>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-2xl font-bold sm:text-3xl">{apps.length} <span className="text-lg font-medium text-muted-foreground">/ {limit}</span></span>
                </div>
              </div>

              <div className="p-5 rounded-2xl bg-card border border-border/50 shadow-sm relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-orange-500/5 rounded-full blur-3xl -mr-10 -mt-10" />
                <div className="flex items-center gap-3 text-muted-foreground mb-4">
                  <HardDrive className="w-4 h-4" />
                  <h3 className="text-sm font-medium">Storage Usage</h3>
                </div>
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <span className="text-2xl font-bold sm:text-3xl">{storageUsage}<span className="ml-1 text-lg font-normal text-muted-foreground">MB</span></span>
                    <span className="text-sm text-muted-foreground">/ {storageLimit} MB</span>
                  </div>
                  <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${storagePercent > 90 ? 'bg-red-500' : 'bg-orange-500'}`} style={{ width: `${storagePercent}%` }} />
                  </div>
                </div>
              </div>

              <div className="p-5 rounded-2xl bg-card border border-border/50 shadow-sm relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-cyan-500/5 rounded-full blur-3xl -mr-10 -mt-10" />
                <div className="flex items-center gap-3 text-muted-foreground mb-4">
                  <Activity className="w-4 h-4" />
                  <h3 className="text-sm font-medium">Bandwidth (30d)</h3>
                </div>
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <span className="text-2xl font-bold sm:text-3xl">{(entitlements?.usage?.bandwidthMb || 0).toFixed(1)}<span className="ml-1 text-lg font-normal text-muted-foreground">MB</span></span>
                    <span className="text-sm text-muted-foreground">/ {(entitlements?.limits?.bandwidthMb || 10240) / 1024} GB</span>
                  </div>
                  <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${((entitlements?.usage?.bandwidthMb || 0) / (entitlements?.limits?.bandwidthMb || 10240)) * 100 > 90 ? 'bg-red-500' : 'bg-cyan-500'}`} style={{ width: `${Math.min(((entitlements?.usage?.bandwidthMb || 0) / (entitlements?.limits?.bandwidthMb || 10240)) * 100, 100)}%` }} />
                  </div>
                </div>
              </div>

              <div className="p-5 rounded-2xl bg-card border border-border/50 shadow-sm relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-purple-500/5 rounded-full blur-3xl -mr-10 -mt-10" />
                <div className="flex items-center gap-3 text-muted-foreground mb-4">
                  <Box className="w-4 h-4" />
                  <h3 className="text-sm font-medium">AI Orchestration</h3>
                </div>
                <div className="flex items-center justify-between">
                  <span className="break-words text-2xl font-bold sm:text-3xl">{entitlements?.usage?.aiRequests || '0'} <span className="text-lg font-medium text-muted-foreground">/ {entitlements?.limits?.aiRequests || '0'} reqs</span></span>
                </div>
              </div>
            </div>

            {/* Applications List */}
            <div>
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                Deployments <span className="px-2 py-0.5 rounded-full bg-muted text-xs font-medium text-muted-foreground">{apps.length}</span>
              </h2>
              
              {apps.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-24 px-4 rounded-2xl border border-dashed border-border/60 bg-muted/10 text-center">
                  <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mb-4 text-muted-foreground shadow-inner">
                    <Box className="w-8 h-8" />
                  </div>
                  <h3 className="text-lg font-semibold mb-2">No applications yet</h3>
                  <p className="text-muted-foreground text-sm max-w-sm mb-6">
                    Deploy your first application using one of our optimized runtimes. Starter plan includes up to {limit} applications.
                  </p>
                  <CreateAppForm limitReached={limitReached} />
                </div>
              ) : (
                <div className="grid gap-3">
                  {apps.map((app: ApplicationItem) => (
                    <ApplicationCardItem
                      key={app.id}
                      app={app}
                      deleteAction={deleteApplication}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Domain Events Log */}
            <EventsPanel events={events} />

            {/* AI Ops Insight */}
            <OpsInsightPanel apps={apps} />

            {/* AI Provisioning Prompt */}
            <AiProvisioningPrompt apps={apps} />

          </div>
    </AppShell>
  );
}
