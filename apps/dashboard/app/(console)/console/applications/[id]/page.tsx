import Link from 'next/link'
import { notFound } from 'next/navigation'
import { UserButton } from '@clerk/nextjs'
import { Activity, ArrowUpRight, Box, FileText, Globe2, GitBranch, HeartPulse, Server } from 'lucide-react'
import AppShell from '../../../../../components/AppShell'
import WordPressFrontendConcept from '../../../../../components/WordPressFrontendConcept'
import { getApplicationLogs, getApplications, getEntitlements } from '../../../../../app/actions'
import { isCurrentUserAdmin } from '../../../../../lib/admin'
import { getAppUrl } from '../../../../../lib/domain'
import { safeAppName } from '../../../../../lib/app-name'

export const dynamic = 'force-dynamic'

type AppRecord = {
  id: string
  name: string
  runtime: string
  status: string
  githubRepo?: string | null
  dockerImage?: string | null
  customDomain?: string | null
  createdAt?: string | Date | null
}

function statusLabel(status: string) {
  if (status === 'running') return { label: 'Healthy', className: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400' }
  if (status === 'failed') return { label: 'Failed', className: 'border-red-500/30 bg-red-500/10 text-red-400' }
  if (status === 'pending' || status === 'provisioning') return { label: 'Deploying', className: 'border-amber-500/30 bg-amber-500/10 text-amber-400' }
  if (status === 'suspended') return { label: 'Suspended', className: 'border-zinc-500/30 bg-zinc-500/10 text-zinc-300' }
  return { label: 'Unknown', className: 'border-border bg-muted text-muted-foreground' }
}

export default async function ApplicationOverviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [apps, entitlements, isAdmin] = await Promise.all([getApplications(), getEntitlements(), isCurrentUserAdmin()])
  const app = (apps as AppRecord[]).find((candidate) => candidate.id === id)
  if (!app) notFound()

  const logs = await getApplicationLogs(app.id)
  const state = statusLabel(app.status)
  const usage = entitlements?.usage?.applications || apps.length
  const limit = entitlements?.limits?.applications || 3
  const appUrl = getAppUrl(safeAppName(app.name))

  return (
    <AppShell
      usage={usage}
      limit={limit}
      activePath="/console"
      planId={entitlements?.planId || 'starter'}
      isAdmin={isAdmin}
      title={app.name}
      titleHref="/console"
      crumb="application"
      actions={<UserButton />}
    >
      <div className="mx-auto max-w-6xl space-y-6">
        <section className="rounded-lg border border-border bg-card p-5">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded-md border px-2 py-1 text-xs font-semibold ${state.className}`}>{state.label}</span>
                <span className="rounded-md border border-border px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{app.runtime}</span>
              </div>
              <h2 className="mt-4 text-2xl font-semibold tracking-tight text-foreground">{app.name}</h2>
              <p className="mt-1 font-mono text-xs text-muted-foreground">{app.id}</p>
            </div>
            <a href={appUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center justify-center gap-1.5 rounded-md border border-border px-3 py-2 text-xs font-medium text-foreground transition-colors hover:bg-muted">
              Open application <ArrowUpRight className="h-3.5 w-3.5" />
            </a>
          </div>
          <p className="mt-5 max-w-2xl text-sm leading-6 text-muted-foreground">
            This page shows the latest evidence AetherHost has received for this application. A running container is not presented as healthy without deployment or readiness evidence.
          </p>
        </section>

        {app.runtime.toLowerCase() === 'wordpress' && isAdmin && <WordPressFrontendConcept appName={app.name} />}

        <div className="grid gap-4 lg:grid-cols-3">
          <section className="rounded-lg border border-border bg-card p-4">
            <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground"><HeartPulse className="h-4 w-4" />Runtime state</div>
            <p className="mt-3 text-lg font-semibold text-foreground">{state.label}</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">{app.status === 'running' ? 'The latest deployment is marked running. Review the evidence below for the most recent agent output.' : 'AetherHost is waiting for new deployment or health evidence.'}</p>
          </section>
          <section className="rounded-lg border border-border bg-card p-4">
            <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground"><Globe2 className="h-4 w-4" />Domain</div>
            <p className="mt-3 break-all text-sm font-semibold text-foreground">{app.customDomain || 'AetherHost address only'}</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">{app.customDomain ? 'Check DNS and HTTPS verification from the Custom Domain controls in the deployment list.' : 'Add a custom domain when this application is ready.'}</p>
          </section>
          <section className="rounded-lg border border-border bg-card p-4">
            <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground"><Box className="h-4 w-4" />Source</div>
            <p className="mt-3 break-all text-sm font-semibold text-foreground">{app.githubRepo ? 'GitHub repository' : app.dockerImage ? 'Container image' : 'AetherHost template'}</p>
            <p className="mt-1 break-all text-xs leading-5 text-muted-foreground">{app.githubRepo || app.dockerImage || 'Managed application source'}</p>
          </section>
        </div>

        <section className="overflow-hidden rounded-lg border border-border bg-card">
          <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-2"><Activity className="h-4 w-4 text-muted-foreground" /><h3 className="text-sm font-semibold text-foreground">Latest deployment evidence</h3></div>
              <p className="mt-1 text-xs text-muted-foreground">Most recent agent logs, newest first.</p>
            </div>
            <Link href="/console" className="text-xs font-medium text-muted-foreground hover:text-foreground">Back to deployments</Link>
          </div>
          {Array.isArray(logs) && logs.length > 0 ? (
            <div className="max-h-96 overflow-y-auto divide-y divide-border font-mono text-xs">
              {logs.map((log: { id?: string; logContent?: string; createdAt?: string }, index: number) => (
                <article key={log.id || index} className="p-4">
                  {log.createdAt && <p className="mb-2 text-[10px] text-muted-foreground">{new Date(log.createdAt).toLocaleString()}</p>}
                  <pre className="whitespace-pre-wrap break-words text-muted-foreground">{log.logContent || 'No log content provided.'}</pre>
                </article>
              ))}
            </div>
          ) : (
            <div className="p-8 text-center"><FileText className="mx-auto h-5 w-5 text-muted-foreground" /><p className="mt-3 text-sm font-medium text-foreground">No deployment evidence yet</p><p className="mx-auto mt-1 max-w-md text-xs leading-5 text-muted-foreground">AetherHost has not received logs for this application. That does not prove the application is healthy or failed; retry the deployment or inspect the runtime before drawing a conclusion.</p></div>
          )}
        </section>

        <section className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-center gap-2"><Server className="h-4 w-4 text-muted-foreground" /><h3 className="text-sm font-semibold text-foreground">Manage this application</h3></div>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">Use the deployment row’s action menu to manage environment variables, image settings, the custom domain, AI-assisted changes, redeployments, and deletion. Dedicated controls for backups and measured metrics are tracked in the customer-readiness initiative.</p>
        </section>
      </div>
    </AppShell>
  )
}
