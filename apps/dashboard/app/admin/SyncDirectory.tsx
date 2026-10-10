'use client'

import { useActionState } from 'react'
import { syncDirectory } from './actions'

export default function SyncDirectory() {
  const [state, action, pending] = useActionState(syncDirectory, null)

  return (
    <form action={action} className="flex items-center gap-3">
      {state && 'error' in state && (
        <p className="text-xs text-red-400">{state.error}</p>
      )}
      {state && 'upserted' in state && (
        <p className="text-xs text-muted-foreground tabular-nums">
          {state.upserted} upserted{state.failed ? ` · ${state.failed} failed` : ''}
          {state.truncated ? ' · truncated at 500' : ''}
        </p>
      )}
      <button
        disabled={pending}
        className="px-3 py-1.5 rounded-lg text-xs font-medium border border-border/60 bg-muted/40 hover:bg-muted/70 disabled:opacity-50"
        title="Upserts missing Clerk users as starter. Refreshes names. Does not touch plan or usage."
      >
        {pending ? 'Reconciling…' : 'Reconcile Clerk'}
      </button>
    </form>
  )
}
