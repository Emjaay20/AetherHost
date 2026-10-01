import { getApplications, getEntitlements, getEvents, runProvisioner } from './actions'
import CreateAppForm from '../components/CreateAppForm'
import EventsPanel from '../components/EventsPanel'
import OpsInsightPanel from '../components/OpsInsightPanel'
import AiProvisioningPrompt from '../components/AiProvisioningPrompt'
import AutoRefresh from '../components/AutoRefresh'
import Sidebar from '../components/Sidebar'
import { Server, Activity, ArrowUpRight, Cpu, LayoutGrid, Settings, Box, Terminal } from 'lucide-react'
import { UserButton, Show, SignInButton } from "@clerk/nextjs";

export default async function Dashboard() {
  const apps = await getApplications()
  const entitlements = await getEntitlements()
  const events = await getEvents()
  
  const usage = entitlements?.usage?.applications || 0
  const limit = entitlements?.limits?.applications || 3
  const limitReached = usage >= limit
  const percentUsed = Math.min((usage / limit) * 100, 100)

  return (
    <div className="min-h-screen flex w-full">
      <AutoRefresh interval={3000} />
      <Sidebar usage={usage} limit={limit} activePath="/" />

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="h-16 flex items-center justify-between px-8 border-b border-border/40 bg-background/50 backdrop-blur-xl sticky top-0 z-10">
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-semibold">Overview</h1>
            <span className="text-muted-foreground">/</span>
            <span className="text-muted-foreground">workspace</span>
          </div>
          <div className="flex items-center gap-4">
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
          <div className="max-w-5xl mx-auto space-y-8">
            
            {/* Stats Row */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-5 rounded-2xl bg-card border border-border/50 shadow-sm relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full blur-3xl -mr-10 -mt-10" />
                <div className="flex items-center gap-3 text-muted-foreground mb-4">
                  <Activity className="w-4 h-4" />
                  <h3 className="text-sm font-medium">Active Deployments</h3>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-3xl font-bold">{apps.length}</span>
                  <div className="flex items-center text-xs text-green-500 font-medium bg-green-500/10 px-2 py-1 rounded-full">
                    <ArrowUpRight className="w-3 h-3 mr-1" /> 100%
                  </div>
                </div>
              </div>

              <div className="p-5 rounded-2xl bg-card border border-border/50 shadow-sm relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-cyan-500/5 rounded-full blur-3xl -mr-10 -mt-10" />
                <div className="flex items-center gap-3 text-muted-foreground mb-4">
                  <Cpu className="w-4 h-4" />
                  <h3 className="text-sm font-medium">Live Memory (Docker)</h3>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-3xl font-bold">{entitlements?.metrics?.currentMemoryMb?.toFixed(1) || '0.0'}<span className="text-lg text-muted-foreground font-normal ml-1">MB</span></span>
                </div>
              </div>

              <div className="p-5 rounded-2xl bg-card border border-border/50 shadow-sm relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-purple-500/5 rounded-full blur-3xl -mr-10 -mt-10" />
                <div className="flex items-center gap-3 text-muted-foreground mb-4">
                  <Box className="w-4 h-4" />
                  <h3 className="text-sm font-medium">AI Orchestration Tokens</h3>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-3xl font-bold">{entitlements?.metrics?.totalAiTokens || '0'}</span>
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
                    <div key={app.id} className="group p-4 rounded-xl border border-border/50 bg-card hover:border-border transition-all shadow-sm hover:shadow-md flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center border border-border/50 group-hover:scale-105 transition-transform">
                          <Box className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h4 className="font-semibold text-sm">{app.name}</h4>
                            <span className="px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider rounded-md bg-blue-500/10 text-blue-400 border border-blue-500/20">
                              {app.runtime}
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground mt-1 font-mono">{app.id}</p>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-6">
                        <div className="flex items-center gap-2">
                          <div className="relative flex h-2 w-2">
                            {app.status === 'running' ? (
                              <>
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                              </>
                            ) : (
                              <>
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
                              </>
                            )}
                          </div>
                          <span className={`text-xs font-medium capitalize ${app.status === 'running' ? 'text-green-500' : 'text-amber-500'}`}>
                            {app.status}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          {(app.runtime === 'docker' || app.aiFiles) && (
                            <a 
                              href={`http://${app.name.toLowerCase().replace(/ /g, '-')}-ide.localhost`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-sm font-medium text-cyan-400 hover:text-cyan-300 transition-colors px-3 py-1.5 rounded-lg border border-cyan-500/30 hover:bg-cyan-500/10 flex items-center gap-1"
                            >
                              <Terminal className="w-3 h-3" />
                              IDE
                            </a>
                          )}
                          <a 
                            href={`http://${app.name.toLowerCase().replace(/ /g, '-')}.localhost`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm font-medium text-foreground/80 hover:text-foreground transition-colors px-3 py-1.5 rounded-lg border border-border/50 hover:bg-muted/50"
                          >
                            Visit
                          </a>
                          <form action={async () => {
                            'use server';
                            const { deleteApplication } = await import('./actions');
                            await deleteApplication(app.id);
                          }}>
                            <button type="submit" className="text-sm font-medium text-red-500 hover:text-red-400 transition-colors px-3 py-1.5 rounded-lg hover:bg-red-500/10">
                              Delete
                            </button>
                          </form>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Domain Events Log */}
            <EventsPanel events={events} />

            {/* AI Ops Insight */}
            <OpsInsightPanel />

            {/* AI Provisioning Prompt */}
            <AiProvisioningPrompt />

          </div>
        </div>
      </main>
    </div>
  );
}
