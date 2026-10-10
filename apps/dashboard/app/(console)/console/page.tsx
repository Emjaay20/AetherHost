import { getApplications, getEntitlements, getEvents, runProvisioner, deleteApplication } from '../../actions'
import CreateAppForm from '../../../components/CreateAppForm'
import EventsPanel from '../../../components/EventsPanel'
import OpsInsightPanel from '../../../components/OpsInsightPanel'
import AiProvisioningPrompt from '../../../components/AiProvisioningPrompt'
import AutoRefresh from '../../../components/AutoRefresh'
import ApplicationCardItem from '../../../components/ApplicationCardItem'
import Sidebar from '../../../components/Sidebar'
import { Server, Activity, ArrowUpRight, Cpu, LayoutGrid, Settings, Box, Terminal, HardDrive } from 'lucide-react'
import { UserButton, Show, SignInButton } from "@clerk/nextjs";
import Link from 'next/link';
import { cookies } from 'next/headers';
import { safeAppName } from '../../../lib/app-name';
import { stopImpersonating } from '../../admin/actions';

export default async function Dashboard() {
  const cookieStore = await cookies();
  const impersonateTenantId = cookieStore.get('aether_impersonate_tenant')?.value;
  const impersonateTenantName = cookieStore.get('aether_impersonate_tenant_name')?.value;

  const apps = await getApplications()
  const entitlements = await getEntitlements()
  const events = await getEvents()
  
  const usage = entitlements?.usage?.applications || 0
  const limit = entitlements?.limits?.applications || 3
  const limitReached = usage >= limit
  const percentUsed = Math.min((usage / limit) * 100, 100)
  
  const storageUsage = entitlements?.usage?.storageMb || 0
  const storageLimit = entitlements?.limits?.storageMb || 512
  const storagePercent = Math.min((storageUsage / storageLimit) * 100, 100)

  const planId = entitlements?.planId || 'starter'

  return (
    <div className="min-h-screen flex w-full">
      <AutoRefresh interval={3000} />
      <Sidebar usage={usage} limit={limit} activePath="/console" />

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {impersonateTenantId && (
          <div className="bg-amber-500/15 border-b border-amber-500/30 px-8 py-2.5 flex items-center justify-between text-xs text-amber-300">
            <div className="flex items-center gap-2">
              <span className="font-semibold uppercase tracking-wider text-[10px] bg-amber-500/20 px-2 py-0.5 rounded border border-amber-500/40">
                Impersonating
              </span>
              <span>
                Operating as <strong>{impersonateTenantName || impersonateTenantId}</strong> ({impersonateTenantId})
              </span>
            </div>
            <form action={stopImpersonating}>
              <button
                type="submit"
                className="px-3 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 border border-amber-500/40 text-xs font-medium transition-colors"
              >
                Exit Impersonation
              </button>
            </form>
          </div>
        )}
        <header className="h-16 flex items-center justify-between px-8 border-b border-border/40 bg-background/50 backdrop-blur-xl sticky top-0 z-10">
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-semibold">Overview</h1>
            <span className="text-muted-foreground">/</span>
            <span className="text-muted-foreground">workspace</span>
          </div>
          <div className="flex items-center gap-4">
            <Link 
              href="/billing"
              className="px-3 py-1.5 rounded-lg text-xs font-medium bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20 transition-colors"
            >
              Current Plan: {planId.toUpperCase()}
            </Link>
            <form action={runProvisioner}>
              <button
                type="submit"
                className="px-4 py-2 rounded-lg font-medium text-sm transition-all duration-200 active:scale-95 shadow-sm bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground border border-border/50"
              >
                Run Provisioner
              </button>
            </form>
            <CreateAppForm limitReached={limitReached} />
            <Show when="signed-in">
              <UserButton />
            </Show>
            <Show when="signed-out">
              <SignInButton mode="modal">
                <button className="px-4 py-2 rounded-lg font-medium text-sm transition-all duration-200 active:scale-95 shadow-sm bg-primary text-primary-foreground hover:bg-primary/90 border border-primary/50">
                  Sign In
                </button>
              </SignInButton>
            </Show>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-8">
          <div className="max-w-6xl mx-auto space-y-8 animate-in fade-in duration-500">
            
            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              
              <div className="p-5 rounded-2xl bg-card border border-border/50 shadow-sm relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-green-500/5 rounded-full blur-3xl -mr-10 -mt-10" />
                <div className="flex items-center gap-3 text-muted-foreground mb-4">
                  <Server className="w-4 h-4" />
                  <h3 className="text-sm font-medium">Active Deployments</h3>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-3xl font-bold">{apps.length} <span className="text-lg font-medium text-muted-foreground">/ {limit}</span></span>
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
                    <span className="text-3xl font-bold">{storageUsage}<span className="text-lg text-muted-foreground font-normal ml-1">MB</span></span>
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
                    <span className="text-3xl font-bold">{(entitlements?.usage?.bandwidthMb || 0).toFixed(1)}<span className="text-lg text-muted-foreground font-normal ml-1">MB</span></span>
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
                  <span className="text-3xl font-bold">{entitlements?.usage?.aiRequests || '0'} <span className="text-lg font-medium text-muted-foreground">/ {entitlements?.limits?.aiRequests || '0'} reqs</span></span>
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
                  {apps.map((app: any) => (
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
            <OpsInsightPanel />

            {/* AI Provisioning Prompt */}
            <AiProvisioningPrompt apps={apps} />

          </div>
        </div>
      </main>
    </div>
  );
}
