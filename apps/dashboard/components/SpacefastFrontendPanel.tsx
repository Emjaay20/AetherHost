'use client'

import { useEffect, useState, useTransition } from 'react'
import { ChevronRight, Globe2, X } from 'lucide-react'
import type { ExternalFrontend, SpacefastConnection } from '../app/actions'
import { disconnectSpacefast, getSpacefastTeams, publishSpacefastFrontend, refreshSpacefastFrontend, selectSpacefastTeam, startSpacefastConnection } from '../app/actions'

type App = { id: string; name: string; status: string }

function deploymentLabel(deployment: ExternalFrontend | undefined) {
  if (!deployment) return 'Not published'
  if (deployment.status === 'published') return 'Published privately'
  if (deployment.status === 'publishing') return 'Publishing'
  if (deployment.status === 'failed') return 'Needs attention'
  return deployment.status
}

function deploymentStatusClass(deployment: ExternalFrontend | undefined) {
  if (deployment?.status === 'published') return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
  if (deployment?.status === 'publishing') return 'border-blue-500/30 bg-blue-500/10 text-blue-600 dark:text-blue-400'
  if (deployment?.status === 'failed') return 'border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400'
  return 'border-border bg-muted text-muted-foreground'
}

const GUIDE_DISMISSAL_KEY = 'aetherhost:spacefast-guide:dismissed:v1'

export default function SpacefastFrontendPanel({ apps, deployments, connection, preferenceScope }: { apps: App[]; deployments: ExternalFrontend[]; connection: SpacefastConnection; preferenceScope: string }) {
  const [consents, setConsents] = useState<Record<string, boolean>>({})
  const [message, setMessage] = useState<Record<string, string>>({})
  const [pending, startTransition] = useTransition()
  const [teams, setTeams] = useState<Array<{ id: string; name?: string; slug?: string }>>([])
  const byApp = new Map(deployments.map((deployment) => [deployment.applicationId, deployment]))
  const publishedCount = deployments.filter((deployment) => deployment.status === 'published').length
  const publishingCount = deployments.filter((deployment) => deployment.status === 'publishing').length
  const failedCount = deployments.filter((deployment) => deployment.status === 'failed').length
  const needsAttention = publishingCount > 0 || failedCount > 0
  const [isPanelOpen, setIsPanelOpen] = useState(needsAttention)
  const [guideReady, setGuideReady] = useState(false)
  const [guideDismissed, setGuideDismissed] = useState(false)
  const [openApps, setOpenApps] = useState<Record<string, boolean>>(() => Object.fromEntries(
    deployments
      .filter((deployment) => deployment.status === 'publishing' || deployment.status === 'failed')
      .map((deployment) => [deployment.applicationId, true]),
  ))
  const guideDismissalKey = `${GUIDE_DISMISSAL_KEY}:${preferenceScope}`

  useEffect(() => {
    try {
      setGuideDismissed(window.localStorage.getItem(guideDismissalKey) === 'true')
    } catch {
      // A private browsing policy can deny storage. Keep the optional guide usable.
    } finally {
      setGuideReady(true)
    }
  }, [guideDismissalKey])

  function dismissGuide() {
    try {
      window.localStorage.setItem(guideDismissalKey, 'true')
    } catch {
      // Hiding the guide still applies until this page is closed if storage is unavailable.
    }
    setGuideDismissed(true)
  }

  function publish(applicationId: string) {
    startTransition(async () => {
      const result = await publishSpacefastFrontend(applicationId)
      setMessage((current) => ({ ...current, [applicationId]: result.error || 'Publish request accepted. Refresh status until finalization completes.' }))
    })
  }

  function refresh(applicationId: string) {
    startTransition(async () => {
      const result = await refreshSpacefastFrontend(applicationId)
      setMessage((current) => ({ ...current, [applicationId]: result.error || 'Spacefast status refreshed.' }))
    })
  }

  function connect() {
    startTransition(async () => {
      const result = await startSpacefastConnection()
      if ('authorizationUrl' in result) window.location.assign(result.authorizationUrl)
      else setMessage((current) => ({ ...current, connection: result.error || 'Could not start Spacefast connection.' }))
    })
  }

  function loadTeams() {
    startTransition(async () => {
      const result = await getSpacefastTeams()
      if ('teams' in result) setTeams(result.teams ?? [])
      else setMessage((current) => ({ ...current, connection: result.error }))
    })
  }

  function chooseTeam(teamId: string) {
    startTransition(async () => {
      const result = await selectSpacefastTeam(teamId)
      setMessage((current) => ({ ...current, connection: result.error || 'Spacefast team selected. Refreshing this page will show the connection.' }))
    })
  }

  function disconnect() {
    startTransition(async () => {
      const result = await disconnectSpacefast()
      setMessage((current) => ({ ...current, connection: result.error || 'Spacefast connection removed. Future publishes use the operator-managed connection.' }))
    })
  }

  if (apps.length === 0) return null

  return (
    <details className="group overflow-hidden rounded-lg border border-border bg-card" open={isPanelOpen} onToggle={(event) => setIsPanelOpen(event.currentTarget.open)}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 p-4 hover:bg-muted/40 [&::-webkit-details-marker]:hidden">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-md border border-border bg-muted text-muted-foreground">
            <Globe2 className="size-4" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">External frontend</p>
            <h2 className="truncate text-sm font-semibold">Spacefast publishing</h2>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="hidden text-xs text-muted-foreground sm:inline">
            {publishedCount > 0 ? `${publishedCount} private ${publishedCount === 1 ? 'site' : 'sites'}` : 'Static exports'}
          </span>
          {publishingCount > 0 && <span className="rounded border border-blue-500/30 bg-blue-500/10 px-2 py-1 text-xs font-medium text-blue-600 dark:text-blue-400">{publishingCount} publishing</span>}
          {failedCount > 0 && <span className="rounded border border-red-500/30 bg-red-500/10 px-2 py-1 text-xs font-medium text-red-600 dark:text-red-400">{failedCount} needs attention</span>}
          <ChevronRight className="size-4 text-muted-foreground transition-transform group-open:rotate-90" aria-hidden="true" />
        </div>
      </summary>

      <div className="border-t border-border">
        <div className="border-b border-border p-4">
          <h3 className="text-base font-semibold">Publish a static artifact to Spacefast</h3>
          <p className="mt-1 max-w-3xl text-xs leading-relaxed text-muted-foreground">
            Use this for a static site, landing page, documentation, or headless WordPress frontend. AetherHost keeps the runtime, data, secrets, and domain controls; Spacefast receives only the static export you approve.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
            {connection.connected ? (
              <span className="text-muted-foreground">Your connected Spacefast team will receive future approved publishes.</span>
            ) : (
              <span className="text-muted-foreground">Approved publishes use AetherHost&apos;s managed private publisher. A customer-owned connection can be added when available.</span>
            )}
            {connection.configured && !connection.connected && !connection.needsTeam && <button onClick={connect} disabled={pending} className="rounded-md border border-border px-2.5 py-1 font-medium hover:bg-muted disabled:opacity-50">Connect your Spacefast account</button>}
            {connection.needsTeam && teams.length === 0 && <button onClick={loadTeams} disabled={pending} className="rounded-md border border-border px-2.5 py-1 font-medium hover:bg-muted disabled:opacity-50">Choose a Spacefast team</button>}
            {connection.needsTeam && teams.length > 0 && <select aria-label="Spacefast team" defaultValue="" disabled={pending} onChange={(event) => event.target.value && chooseTeam(event.target.value)} className="rounded-md border border-border bg-background px-2.5 py-1"><option value="" disabled>Select team</option>{teams.map((team) => <option value={team.id} key={team.id}>{team.name || team.slug || team.id}</option>)}</select>}
            {connection.connected && <><span className="rounded border border-emerald-500/30 px-2 py-1 text-emerald-600 dark:text-emerald-400">Customer-owned connection active</span><button onClick={disconnect} disabled={pending} className="rounded-md border border-border px-2.5 py-1 font-medium hover:bg-muted disabled:opacity-50">Disconnect</button></>}
            {message.connection && <span role="status" className="text-muted-foreground">{message.connection}</span>}
          </div>
        </div>

        {guideReady && !guideDismissed && (
          <aside className="border-b border-border bg-muted/20 p-4" aria-label="Spacefast publishing guide">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">First publish guide</p>
                <h3 className="mt-1 text-sm font-semibold">From an AetherHost app to a private Spacefast site</h3>
              </div>
              <button type="button" onClick={dismissGuide} className="rounded-md p-1 text-muted-foreground hover:bg-background hover:text-foreground" aria-label="Dismiss Spacefast publishing guide" title="Dismiss guide">
                <X className="size-4" />
              </button>
            </div>
            <ol className="mt-3 grid gap-3 text-xs leading-relaxed text-muted-foreground sm:grid-cols-3">
              <li><span className="mr-1.5 font-semibold text-foreground">1.</span>Open the application below and confirm it has the static frontend you want to share.</li>
              <li><span className="mr-1.5 font-semibold text-foreground">2.</span>Approve that single static export, then publish it privately to your selected Spacefast team.</li>
              <li><span className="mr-1.5 font-semibold text-foreground">3.</span>Check the published version. Your runtime, secrets, database, and domains remain on AetherHost.</li>
            </ol>
            <button type="button" onClick={dismissGuide} className="mt-3 text-xs font-medium text-foreground underline decoration-border underline-offset-4 hover:decoration-foreground">Got it, hide this guide</button>
          </aside>
        )}

        <div className="divide-y divide-border">
          {apps.map((app) => {
            const deployment = byApp.get(app.id)
            const consented = Boolean(consents[app.id])
            const appNeedsAttention = deployment?.status === 'publishing' || deployment?.status === 'failed'
            return (
              <details key={app.id} className="group/app" open={openApps[app.id] ?? appNeedsAttention} onToggle={(event) => setOpenApps((current) => ({ ...current, [app.id]: event.currentTarget.open }))}>
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4 hover:bg-muted/40 [&::-webkit-details-marker]:hidden">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{app.name}</p>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      {deployment ? `${deployment.artifactPath}${deployment.versionId ? ` · ${deployment.versionId}` : ''}` : 'No external frontend published'}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className={`rounded border px-2 py-1 text-xs font-medium ${deploymentStatusClass(deployment)}`}>{deploymentLabel(deployment)}</span>
                    <ChevronRight className="size-4 text-muted-foreground transition-transform group-open/app:rotate-90" aria-hidden="true" />
                  </div>
                </summary>
                <div className="border-t border-border bg-muted/20 p-4">
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    Only the saved static export is sent. Application code, runtime containers, environment variables, databases, and domain settings remain in AetherHost.
                  </p>
                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    {deployment?.status === 'publishing' ? (
                      <button onClick={() => refresh(app.id)} disabled={pending} className="rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-background disabled:opacity-50">
                        Refresh status
                      </button>
                    ) : (
                      <>
                        <label className="flex items-start gap-2 text-xs text-muted-foreground">
                          <input type="checkbox" checked={consented} onChange={(event) => setConsents((current) => ({ ...current, [app.id]: event.target.checked }))} className="mt-0.5" />
                          <span>I approve sending this app&apos;s selected static export to a private Spacefast Space{deployment ? ' as a new version' : ''}.</span>
                        </label>
                        <button onClick={() => publish(app.id)} disabled={pending || !consented} className="rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-background hover:bg-foreground/90 disabled:cursor-not-allowed disabled:opacity-40">
                          {deployment ? 'Publish new version' : 'Publish privately'}
                        </button>
                      </>
                    )}
                  </div>
                  {deployment?.immutableUrl && <p className="mt-3 text-xs"><a className="text-primary underline underline-offset-4" href={deployment.immutableUrl} target="_blank" rel="noreferrer">Open immutable version</a></p>}
                  {deployment?.lastErrorCode && <p className="mt-3 text-xs text-red-500 dark:text-red-400">Last provider status: {deployment.lastErrorCode}</p>}
                  {message[app.id] && <p className="mt-3 text-xs text-muted-foreground" role="status">{message[app.id]}</p>}
                </div>
              </details>
            )
          })}
        </div>
      </div>
    </details>
  )
}
