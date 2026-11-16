'use client'

import { useState, useTransition } from 'react'
import type { ExternalFrontend, SpacefastConnection } from '../app/actions'
import { disconnectSpacefast, getSpacefastTeams, publishSpacefastFrontend, refreshSpacefastFrontend, selectSpacefastTeam, startSpacefastConnection } from '../app/actions'

type App = { id: string; name: string; status: string }

export default function SpacefastFrontendPanel({ apps, deployments, connection }: { apps: App[]; deployments: ExternalFrontend[]; connection: SpacefastConnection }) {
  const [consents, setConsents] = useState<Record<string, boolean>>({})
  const [message, setMessage] = useState<Record<string, string>>({})
  const [pending, startTransition] = useTransition()
  const [teams, setTeams] = useState<Array<{ id: string; name?: string; slug?: string }>>([])
  const byApp = new Map(deployments.map((deployment) => [deployment.applicationId, deployment]))

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
    <section className="rounded-lg border border-border bg-card">
      <div className="border-b border-border p-4">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">External frontend</p>
        <h2 className="mt-1 text-base font-semibold">Publish a static artifact to Spacefast</h2>
        <p className="mt-1 max-w-3xl text-xs leading-relaxed text-muted-foreground">
          AetherHost keeps your runtime, data, secrets, and domain controls. Spacefast receives only the selected static export stored with this application.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
          <span className="text-muted-foreground">{connection.message}</span>
          {connection.configured && !connection.connected && !connection.needsTeam && <button onClick={connect} disabled={pending} className="rounded-md border border-border px-2.5 py-1 font-medium hover:bg-muted disabled:opacity-50">Connect your Spacefast account</button>}
          {connection.needsTeam && teams.length === 0 && <button onClick={loadTeams} disabled={pending} className="rounded-md border border-border px-2.5 py-1 font-medium hover:bg-muted disabled:opacity-50">Choose a Spacefast team</button>}
          {connection.needsTeam && teams.length > 0 && <select aria-label="Spacefast team" defaultValue="" disabled={pending} onChange={(event) => event.target.value && chooseTeam(event.target.value)} className="rounded-md border border-border bg-background px-2.5 py-1"><option value="" disabled>Select team</option>{teams.map((team) => <option value={team.id} key={team.id}>{team.name || team.slug || team.id}</option>)}</select>}
          {connection.connected && <><span className="rounded border border-emerald-500/30 px-2 py-1 text-emerald-500">Customer-owned connection active</span><button onClick={disconnect} disabled={pending} className="rounded-md border border-border px-2.5 py-1 font-medium hover:bg-muted disabled:opacity-50">Disconnect</button></>}
          {message.connection && <span role="status" className="text-muted-foreground">{message.connection}</span>}
        </div>
      </div>
      <div className="divide-y divide-border">
        {apps.map((app) => {
          const deployment = byApp.get(app.id)
          const consented = Boolean(consents[app.id])
          return (
            <div key={app.id} className="p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">{app.name}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {deployment
                      ? `${deployment.status} · ${deployment.artifactPath}${deployment.versionId ? ` · ${deployment.versionId}` : ''}`
                      : 'No external frontend published'}
                  </p>
                </div>
                {deployment?.status === 'publishing' ? (
                  <button onClick={() => refresh(app.id)} disabled={pending} className="rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-50">
                    Refresh status
                  </button>
                ) : (
                  <button onClick={() => publish(app.id)} disabled={pending || !consented} className="rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-background hover:bg-foreground/90 disabled:cursor-not-allowed disabled:opacity-40">
                    {deployment ? 'Publish new version' : 'Publish privately'}
                  </button>
                )}
              </div>
              <label className="mt-3 flex items-start gap-2 text-xs text-muted-foreground">
                <input type="checkbox" checked={consented} onChange={(event) => setConsents((current) => ({ ...current, [app.id]: event.target.checked }))} className="mt-0.5" />
                <span>I approve sending this app&apos;s selected static export to a private Spacefast Space{deployment ? ' as a new version' : ''}.</span>
              </label>
              {deployment?.immutableUrl && <p className="mt-3 text-xs"><a className="text-primary underline underline-offset-4" href={deployment.immutableUrl} target="_blank" rel="noreferrer">Open immutable version</a></p>}
              {deployment?.lastErrorCode && <p className="mt-3 text-xs text-red-400">Last provider status: {deployment.lastErrorCode}</p>}
              {message[app.id] && <p className="mt-3 text-xs text-muted-foreground" role="status">{message[app.id]}</p>}
            </div>
          )
        })}
      </div>
    </section>
  )
}
