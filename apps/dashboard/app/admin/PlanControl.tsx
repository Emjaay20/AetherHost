'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { applyOperatorPlan } from './actions'
import { money } from './format'
import type { CatalogPlan } from './types'

export default function PlanControl({
  tenantId,
  currentPlan,
  drift,
  catalog,
}: {
  tenantId: string
  currentPlan: string
  drift: string[]
  catalog: CatalogPlan[]
}) {
  const router = useRouter()
  const lock = useRef(false)
  const [pending, setPending] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function apply(planId: string) {
    if (lock.current) return
    const same = planId === currentPlan
    if (!same && confirm !== planId) {
      setConfirm(planId)
      setError(null)
      return
    }
    lock.current = true
    setPending(planId)
    setError(null)
    const result = await applyOperatorPlan(tenantId, planId, crypto.randomUUID().replace(/-/g, '').slice(0, 24))
    lock.current = false
    setPending(null)
    setConfirm(null)
    if ('error' in result) {
      setError(result.error)
      return
    }
    setNotice(result.message)
    router.refresh()
  }

  return (
    <div className="space-y-3">
      <div className="grid md:grid-cols-3 gap-3">
        {catalog.map((plan) => {
          const current = plan.id === currentPlan
          const armed = confirm === plan.id
          return (
            <div
              key={plan.id}
              className={`rounded-2xl border p-4 ${current ? 'border-primary/40 bg-primary/5' : 'border-border/50 bg-card/80'}`}
            >
              <div className="flex items-center justify-between">
                <p className="font-medium">{plan.name}</p>
                <p className="text-sm tabular-nums">{money(plan.monthlyPriceCent / 100)}<span className="text-muted-foreground">/mo</span></p>
              </div>
              <ul className="mt-3 space-y-1 text-[11px] text-muted-foreground font-mono">
                <li>{plan.limits.applications} apps</li>
                <li>{plan.limits.aiRequests} AI requests</li>
                <li>{plan.limits.storageMb} MB storage</li>
                <li>{plan.limits.bandwidthGb} GB bandwidth</li>
              </ul>
              <button
                type="button"
                disabled={pending !== null || (current && drift.length === 0)}
                onClick={() => apply(plan.id)}
                className="mt-4 w-full px-3 py-1.5 rounded-lg text-xs font-medium border border-border/60 hover:bg-muted/50 disabled:opacity-40"
              >
                {pending === plan.id
                  ? 'Applying…'
                  : current && drift.length > 0
                    ? 'Reconcile limits'
                    : current
                      ? 'Current plan'
                      : armed
                        ? 'Confirm apply'
                        : 'Apply plan'}
              </button>
            </div>
          )
        })}
      </div>
      {error && <p className="text-xs text-red-400">{error}</p>}
      {notice && <p className="text-xs text-green-400">{notice}</p>}
      <p className="text-[11px] leading-relaxed text-muted-foreground max-w-3xl">
        A different plan calls <span className="font-mono">processWebhook</span> as provider <span className="font-mono">operator</span>. Paid plans write an invoice and <span className="font-mono">PLAN_UPGRADED</span>. Same-plan drift calls <span className="font-mono">applyPlan</span> only and writes <span className="font-mono">ENTITLEMENTS_RECONCILED</span>. This path does not suspend apps over the new limit. Cancellation dunning does.
      </p>
    </div>
  )
}
