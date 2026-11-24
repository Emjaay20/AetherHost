'use client'

import { useEffect, useState, useTransition } from 'react'
import { BookOpen, Loader2, Sparkles, X } from 'lucide-react'
import { createAetherPressLaunchpad } from '../app/actions'

const DISMISSAL_KEY = 'aetherhost:aetherpress-launchpad:dismissed:v1'

export default function AetherPressLaunchpad({ limitReached, preferenceScope }: { limitReached: boolean; preferenceScope: string }) {
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [message, setMessage] = useState<string | null>(null)
  const [ready, setReady] = useState(false)
  const [dismissed, setDismissed] = useState(false)

  const dismissalKey = `${DISMISSAL_KEY}:${preferenceScope}`

  useEffect(() => {
    try {
      setDismissed(window.localStorage.getItem(dismissalKey) === 'true')
    } catch {
      // A private browsing policy can deny storage. Keep the optional card usable.
    } finally {
      setReady(true)
    }
  }, [dismissalKey])

  function dismiss() {
    try {
      window.localStorage.setItem(dismissalKey, 'true')
    } catch {
      // Dismissing should still work for this session if storage is unavailable.
    }
    setDismissed(true)
  }

  function submit(formData: FormData) {
    startTransition(async () => {
      const result = await createAetherPressLaunchpad(formData)
      if ('error' in result) {
        setMessage(result.error)
        return
      }
      setMessage('Launchpad created. AetherHost is provisioning it now; open Spacefast publishing once it is running.')
      setOpen(false)
    })
  }

  if (!ready || dismissed) return null

  return (
    <section className="rounded-lg border border-border bg-card p-4 sm:p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-md border border-violet-500/30 bg-violet-500/10 text-violet-600 dark:text-violet-400"><BookOpen className="size-4" /></div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Demo project</p>
            <h2 className="text-sm font-semibold">AetherPress Launchpad</h2>
            <p className="mt-1 max-w-2xl text-xs leading-relaxed text-muted-foreground">A small editorial companion: WordPress remains the source of published posts, AetherHost runs the app, and the selected static frontend can be published privately to Spacefast.</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button type="button" onClick={dismiss} className="rounded-md px-3 py-2 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground">Dismiss</button>
          <button type="button" onClick={() => { setMessage(null); setOpen(true) }} disabled={limitReached} className="inline-flex items-center justify-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-xs font-medium hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"><Sparkles className="size-3.5" />Create demo</button>
        </div>
      </div>
      {message && <p role="status" className="mt-3 text-xs text-muted-foreground">{message}</p>}

      {open && (
        <div className="mt-4 border-t border-border pt-4">
          <div className="mb-3 flex items-start justify-between gap-3"><div><h3 className="text-sm font-semibold">Connect a public WordPress site</h3><p className="mt-1 text-xs leading-relaxed text-muted-foreground">Optional. Enter only the public site origin. The demo reads published posts through the public WordPress REST API; it never asks for an admin account, token, database, or plugin access.</p></div><button type="button" aria-label="Close AetherPress demo form" onClick={() => setOpen(false)} className="rounded p-1 text-muted-foreground hover:bg-muted"><X className="size-4" /></button></div>
          <form action={submit} className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <label className="min-w-0 flex-1 text-xs font-medium">WordPress site URL <span className="font-normal text-muted-foreground">(optional)</span><input name="wordpressSiteUrl" type="url" placeholder="https://editorial.example.com" className="mt-1.5 w-full rounded-md border border-border bg-background px-3 py-2 text-xs font-normal outline-none focus:border-primary" /></label>
            <button type="submit" disabled={pending} className="inline-flex items-center justify-center gap-2 rounded-md bg-foreground px-3 py-2 text-xs font-medium text-background hover:bg-foreground/90 disabled:opacity-50">{pending && <Loader2 className="size-3.5 animate-spin" />}Create and provision</button>
          </form>
        </div>
      )}
    </section>
  )
}
