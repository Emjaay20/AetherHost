'use client'

import { useState, useTransition } from 'react'
import type { ExternalFrontend } from '../app/actions'
import { publishSpacefastFrontend, refreshSpacefastFrontend } from '../app/actions'

type App = { id: string; name: string; status: string }

export default function SpacefastFrontendPanel({ apps, deployments }: { apps: App[]; deployments: ExternalFrontend[] }) {
  const [consents, setConsents] = useState<Record<string, boolean>>({})
  const [message, setMessage] = useState<Record<string, string>>({})
  const [pending, startTransition] = useTransition()
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

  if (apps.length === 0) return null

  return (
    <section className="rounded-lg border border-border bg-card">
      <div className="border-b border-border p-4">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">External frontend</p>
        <h2 className="mt-1 text-base font-semibold">Publish a static artifact to Spacefast</h2>
        <p className="mt-1 max-w-3xl text-xs leading-relaxed text-muted-foreground">
          AetherHost keeps your runtime, data, secrets, and domain controls. Spacefast receives only the explicit static index.html artifact stored with this application.
        </p>
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
