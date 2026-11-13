import { getApplications, getEntitlements, getEvents, runProvisioner, deleteApplication } from '../../actions'
import CreateAppForm from '../../../components/CreateAppForm'
import EventsPanel from '../../../components/EventsPanel'
import OpsInsightPanel from '../../../components/OpsInsightPanel'
import AiProvisioningPrompt from '../../../components/AiProvisioningPrompt'
import AutoRefresh from '../../../components/AutoRefresh'
import DeploymentList from '../../../components/DeploymentList'
import AppShell from '../../../components/AppShell'
import { Server, Activity, Box, HardDrive } from 'lucide-react'
import { UserButton, Show, SignInButton } from "@clerk/nextjs";
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
  const storageUnlimited = storageLimit >= UNLIMITED_LIMIT
  const storagePercent = Math.min((storageUsage / storageLimit) * 100, 100)

  const bandwidthUsage = numericValue(entitlements?.usage?.bandwidthMb)
  const bandwidthLimit = numericValue(entitlements?.limits?.bandwidthMb) || 10240
  const bandwidthUnlimited = bandwidthLimit >= UNLIMITED_LIMIT
  const bandwidthPercent = Math.min((bandwidthUsage / bandwidthLimit) * 100, 100)

  const planId = entitlements?.planId || 'starter'
  const aiLimit = numericValue(entitlements?.limits?.aiRequests)
  const aiUnlimited = aiLimit >= UNLIMITED_LIMIT

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
              <span className="rounded border border-amber-500/40 bg-amber-500/20 px-2 py-0.5 text-xs font-semibold uppercase tracking-wider">
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
          {isAdmin && (
            <form action={runProvisioner}>
              <button
                type="submit"
                className="whitespace-nowrap rounded-md border border-border bg-muted px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/80 hover:text-foreground"
              >
                Run Provisioner
              </button>
            </form>
          )}
          <CreateAppForm limitReached={limitReached} />
          <Show when="signed-in">
            <UserButton />
          </Show>
          <Show when="signed-out">
            <SignInButton mode="modal">
              <button className="rounded-md border border-border bg-foreground px-3.5 py-1.5 text-xs font-medium text-background transition-colors hover:bg-foreground/90">
                Sign In
              </button>
            </SignInButton>
          </Show>
        </>
      }
    >
      <AutoRefresh interval={8000} />
      <div className="mx-auto max-w-6xl space-y-6">
            
            {/* Stats Section */}
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 rounded-lg border border-border bg-card divide-y sm:divide-y-0 sm:divide-x divide-border">
              {/* Deployments */}
              <div className="p-4 sm:p-5 flex flex-col justify-between">
                <div className="mb-4 flex items-center gap-2 text-muted-foreground">
                  <Server className="w-4 h-4" />
                  <h3 className="text-xs font-medium uppercase tracking-wider">Active Deployments</h3>
                </div>
                <div>
                  <span className="block text-2xl sm:text-3xl font-semibold leading-none tracking-tight tabular-nums text-foreground">{apps.length}</span>
                  <span className="mt-2 block text-xs text-muted-foreground">{limit >= UNLIMITED_LIMIT ? 'Unlimited' : `of ${limit} deployments`}</span>
                </div>
              </div>

              {/* Storage */}
              <div className="p-4 sm:p-5 flex flex-col justify-between">
                <div className="mb-4 flex items-center gap-2 text-muted-foreground">
                  <HardDrive className="w-4 h-4" />
                  <h3 className="text-xs font-medium uppercase tracking-wider">Storage Usage</h3>
                </div>
                <div className={storageUnlimited ? '' : 'space-y-2'}>
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="block text-2xl sm:text-3xl font-semibold leading-none tracking-tight tabular-nums text-foreground">{formatMegabytes(storageUsage)}</span>
                    {!storageUnlimited && <span className="text-xs font-mono text-muted-foreground">{formatPercent(storagePercent)}</span>}
                  </div>
                  {!storageUnlimited && (
                    <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-300 ${storagePercent >= 90 ? 'bg-red-500' : storagePercent >= 80 ? 'bg-amber-500' : 'bg-foreground/40'}`}
                        style={{ width: `${storagePercent}%` }}
                      />
                    </div>
                  )}
                  <span className={`block text-xs text-muted-foreground ${storageUnlimited ? 'mt-2' : ''}`}>{storageUnlimited ? 'Unlimited' : `of ${formatLimit(storageLimit)}`}</span>
                </div>
              </div>

              {/* Bandwidth */}
              <div className="p-4 sm:p-5 flex flex-col justify-between">
                <div className="mb-4 flex items-center gap-2 text-muted-foreground">
                  <Activity className="w-4 h-4" />
                  <h3 className="text-xs font-medium uppercase tracking-wider">Bandwidth (30d)</h3>
                </div>
                <div className={bandwidthUnlimited ? '' : 'space-y-2'}>
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="block text-2xl sm:text-3xl font-semibold leading-none tracking-tight tabular-nums text-foreground">{formatMegabytes(bandwidthUsage)}</span>
                    {!bandwidthUnlimited && <span className="text-xs font-mono text-muted-foreground">{formatPercent(bandwidthPercent)}</span>}
                  </div>
                  {!bandwidthUnlimited && (
                    <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-300 ${bandwidthPercent >= 90 ? 'bg-red-500' : bandwidthPercent >= 80 ? 'bg-amber-500' : 'bg-foreground/40'}`}
                        style={{ width: `${bandwidthPercent}%` }}
                      />
                    </div>
                  )}
                  <span className={`block text-xs text-muted-foreground ${bandwidthUnlimited ? 'mt-2' : ''}`}>{bandwidthUnlimited ? 'Unlimited' : `of ${formatLimit(bandwidthLimit)}`}</span>
                </div>
              </div>

              {/* AI Requests */}
              <div className="p-4 sm:p-5 flex flex-col justify-between">
                <div className="mb-4 flex items-center gap-2 text-muted-foreground">
                  <Box className="w-4 h-4" />
                  <h3 className="text-xs font-medium uppercase tracking-wider">AI Orchestration</h3>
                </div>
                <div>
                  <span className="block text-2xl sm:text-3xl font-semibold leading-none tracking-tight tabular-nums text-foreground">{entitlements?.usage?.aiRequests || 0}</span>
                  <span className="mt-2 block text-xs text-muted-foreground">{aiUnlimited ? 'Unlimited' : `of ${aiLimit} requests`}</span>
                </div>
              </div>
            </div>

            {/* Applications List */}
            <div>
              {apps.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 px-4 rounded-lg border border-border bg-card text-center">
                  <div className="w-12 h-12 rounded-lg bg-muted flex items-center justify-center mb-3 text-muted-foreground">
                    <Box className="w-6 h-6" />
                  </div>
                  <h3 className="text-base font-semibold mb-1 text-foreground">No applications yet</h3>
                  <p className="text-muted-foreground text-xs max-w-sm mb-5">
                    Deploy your first application using one of our optimized runtimes. Starter plan includes up to {limit} applications.
                  </p>
                  <CreateAppForm limitReached={limitReached} />
                </div>
              ) : <DeploymentList apps={apps} deleteAction={deleteApplication} />}
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
