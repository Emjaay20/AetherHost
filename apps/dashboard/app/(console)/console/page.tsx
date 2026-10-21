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

const UNLIMITED_LIMIT = 999_999

function numericValue(value: number | undefined) {
  return Number.isFinite(value) ? Math.max(value || 0, 0) : 0
}

function formatMegabytes(value: number) {
  const megabytes = numericValue(value)
  const displayValue = megabytes >= 1024 ? megabytes / 1024 : megabytes
  const unit = megabytes >= 1024 ? 'GB' : 'MB'

  return `${new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 1,
  }).format(displayValue)} ${unit}`
}

function formatLimit(value: number) {
  return value >= UNLIMITED_LIMIT ? 'Unlimited' : formatMegabytes(value)
}

function formatPercent(value: number) {
  if (value > 0 && value < 0.1) return '<0.1%'
  return `${value.toFixed(1)}%`
}

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
  
  const storageUsage = numericValue(entitlements?.usage?.storageMb)
  const storageLimit = numericValue(entitlements?.limits?.storageMb) || 512
  const storagePercent = Math.min((storageUsage / storageLimit) * 100, 100)

  const bandwidthUsage = numericValue(entitlements?.usage?.bandwidthMb)
  const bandwidthLimit = numericValue(entitlements?.limits?.bandwidthMb) || 10240
  const bandwidthPercent = Math.min((bandwidthUsage / bandwidthLimit) * 100, 100)

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
              
              <div className="relative min-w-0 overflow-hidden rounded-2xl border border-border/50 bg-card p-5 shadow-sm">
                <div className="absolute top-0 right-0 w-32 h-32 bg-green-500/5 rounded-full blur-3xl -mr-10 -mt-10" />
                <div className="mb-5 flex items-center gap-3 text-muted-foreground">
                  <Server className="w-4 h-4" />
                  <h3 className="text-sm font-medium">Active Deployments</h3>
                </div>
                <div className="flex items-end justify-between gap-3">
                  <div className="min-w-0">
                    <span className="block text-3xl font-bold leading-none tracking-tight tabular-nums">{apps.length}</span>
                    <span className="mt-2 block text-xs text-muted-foreground">of {limit >= UNLIMITED_LIMIT ? 'Unlimited' : limit} deployments</span>
                  </div>
                  <span className="shrink-0 rounded-full border border-green-500/20 bg-green-500/10 px-2 py-1 text-[11px] font-medium text-green-500">Active</span>
                </div>
              </div>

              <div className="relative min-w-0 overflow-hidden rounded-2xl border border-border/50 bg-card p-5 shadow-sm">
                <div className="absolute top-0 right-0 w-32 h-32 bg-orange-500/5 rounded-full blur-3xl -mr-10 -mt-10" />
                <div className="mb-5 flex items-center gap-3 text-muted-foreground">
                  <HardDrive className="w-4 h-4" />
                  <h3 className="text-sm font-medium">Storage Usage</h3>
                </div>
                <div className="space-y-3">
                  <div className="flex items-end justify-between gap-3">
                    <div className="min-w-0">
                      <span className="block truncate text-3xl font-bold leading-none tracking-tight tabular-nums">{formatMegabytes(storageUsage)}</span>
                      <span className="mt-2 block text-xs text-muted-foreground">of {formatLimit(storageLimit)}</span>
                    </div>
                    <span className="shrink-0 text-xs font-medium text-muted-foreground">{formatPercent(storagePercent)} used</span>
                  </div>
                  <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${storagePercent > 90 ? 'bg-red-500' : 'bg-orange-500'}`} style={{ width: `${storagePercent}%` }} />
                  </div>
                </div>
              </div>

              <div className="relative min-w-0 overflow-hidden rounded-2xl border border-border/50 bg-card p-5 shadow-sm">
                <div className="absolute top-0 right-0 w-32 h-32 bg-cyan-500/5 rounded-full blur-3xl -mr-10 -mt-10" />
                <div className="mb-5 flex items-center gap-3 text-muted-foreground">
                  <Activity className="w-4 h-4" />
                  <h3 className="text-sm font-medium">Bandwidth (30d)</h3>
                </div>
                <div className="space-y-3">
                  <div className="flex items-end justify-between gap-3">
                    <div className="min-w-0">
                      <span className="block truncate text-3xl font-bold leading-none tracking-tight tabular-nums">{formatMegabytes(bandwidthUsage)}</span>
                      <span className="mt-2 block text-xs text-muted-foreground">of {formatLimit(bandwidthLimit)}</span>
                    </div>
                    <span className="shrink-0 text-xs font-medium text-muted-foreground">{formatPercent(bandwidthPercent)} used</span>
                  </div>
                  <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${bandwidthPercent > 90 ? 'bg-red-500' : 'bg-cyan-500'}`} style={{ width: `${bandwidthPercent}%` }} />
                  </div>
                </div>
              </div>

              <div className="relative min-w-0 overflow-hidden rounded-2xl border border-border/50 bg-card p-5 shadow-sm">
                <div className="absolute top-0 right-0 w-32 h-32 bg-purple-500/5 rounded-full blur-3xl -mr-10 -mt-10" />
                <div className="mb-5 flex items-center gap-3 text-muted-foreground">
                  <Box className="w-4 h-4" />
                  <h3 className="text-sm font-medium">AI Orchestration</h3>
                </div>
                <div className="flex items-end justify-between gap-3">
                  <div className="min-w-0">
                    <span className="block text-3xl font-bold leading-none tracking-tight tabular-nums">{entitlements?.usage?.aiRequests || 0}</span>
                    <span className="mt-2 block text-xs text-muted-foreground">of {(entitlements?.limits?.aiRequests || 0) >= UNLIMITED_LIMIT ? 'Unlimited' : entitlements?.limits?.aiRequests || 0} requests</span>
                  </div>
                  <span className="shrink-0 rounded-full border border-purple-500/20 bg-purple-500/10 px-2 py-1 text-[11px] font-medium text-purple-400">This month</span>
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
