'use client'

import { useState } from 'react'
import { Calendar, AlertCircle, X, CheckCircle2, Clock, ShieldCheck, ArrowRight } from 'lucide-react'
import { submitChiliPiperConcierge, getInstantBookerUrl } from '../lib/chilipiper'

interface ChiliPiperEscalationProps {
  tenantId?: string
  tenantEmail?: string
  defaultReason?: string
  buttonLabel?: string
  variant?: 'banner' | 'button' | 'badge'
}

export default function ChiliPiperEscalation({
  tenantId = 'tenant_default',
  tenantEmail = '',
  defaultReason = 'Deployment Troubleshooting',
  buttonLabel = 'Book 15-min Technical Session with EMEA CSM',
  variant = 'button',
}: ChiliPiperEscalationProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [email, setEmail] = useState(tenantEmail)
  const [reason, setReason] = useState(defaultReason)
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'fallback'>('idle')

  const handleLaunchBooking = async (e: React.FormEvent) => {
    e.preventDefault()
    setStatus('loading')

    const success = await submitChiliPiperConcierge(
      'aetherhost',
      'emea-cs-instant-booker',
      {
        Email: email || 'operator@company.com',
        Workspace_ID__c: tenantId,
        Escalation_Reason__c: reason,
        Region: 'EMEA',
      },
      {
        onSuccess: () => {
          setStatus('success')
        },
        onError: () => {
          // If script blocked or router not configured, show instant booker fallback
          setStatus('fallback')
        },
      }
    )

    if (!success) {
      setStatus('fallback')
    }
  }

  const instantBookerUrl = getInstantBookerUrl({
    csmSlug: 'emea-technical-csm',
    email,
    tenantId,
    reason,
  })

  return (
    <>
      {variant === 'banner' && (
        <div className="flex items-center justify-between rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-amber-200">
          <div className="flex items-center gap-3">
            <AlertCircle className="h-5 w-5 shrink-0 text-amber-400" />
            <div className="text-sm">
              <span className="font-semibold text-white">Need technical assistance?</span> Dedicated EMEA Customer
              Success is on standby.
            </div>
          </div>
          <button
            type="button"
            onClick={() => setIsOpen(true)}
            className="flex items-center gap-1.5 rounded-lg bg-amber-500/20 px-3 py-1.5 text-xs font-medium text-amber-300 hover:bg-amber-500/30 transition-colors"
          >
            <Calendar className="h-3.5 w-3.5" /> Book Session
          </button>
        </div>
      )}

      {variant === 'button' && (
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-3.5 py-2 text-xs font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 transition-all"
        >
          <Calendar className="h-4 w-4" />
          {buttonLabel}
        </button>
      )}

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="relative w-full max-w-lg rounded-2xl border border-border/60 bg-card p-6 shadow-2xl">
            <button
              type="button"
              onClick={() => {
                setIsOpen(false)
                setStatus('idle')
              }}
              className="absolute right-4 top-4 rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>

            <div className="flex items-center gap-3 mb-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Calendar className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-semibold text-base text-foreground">Dedicated CS Escalation</h3>
                <p className="text-xs text-muted-foreground">Powered by Chili Piper Instant Booker</p>
              </div>
            </div>

            {status === 'success' ? (
              <div className="py-8 text-center space-y-3">
                <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-400" />
                <h4 className="text-base font-semibold text-foreground">Session Confirmed!</h4>
                <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                  A calendar invitation with video bridge details has been sent to {email}. Your EMEA CSM has received
                  the workspace context and diagnostics.
                </p>
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="mt-4 rounded-lg bg-primary px-4 py-2 text-xs font-medium text-primary-foreground"
                >
                  Close
                </button>
              </div>
            ) : status === 'fallback' ? (
              <div className="space-y-4 py-2">
                <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 text-xs text-muted-foreground space-y-2">
                  <div className="flex items-center gap-2 font-medium text-foreground">
                    <ShieldCheck className="h-4 w-4 text-emerald-400" />
                    Chili Piper Instant Routing Active
                  </div>
                  <p>
                    Direct slot reservation link generated for EMEA CSM. Click below to view live calendar availability.
                  </p>
                </div>
                <a
                  href={instantBookerUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary py-2.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
                >
                  Open Chili Piper Calendar <ArrowRight className="h-3.5 w-3.5" />
                </a>
              </div>
            ) : (
              <form onSubmit={handleLaunchBooking} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-foreground mb-1">Work Email</label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@company.com"
                    className="w-full rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-foreground mb-1">Escalation Topic</label>
                  <select
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    className="w-full rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  >
                    <option value="Deployment Troubleshooting">Deployment & Readiness Probe Failures</option>
                    <option value="DNS & Custom Domain SSL">DNS & Let's Encrypt Wildcard Verification</option>
                    <option value="Enterprise Onboarding & Migration">Enterprise Onboarding & Zero-Downtime Migration</option>
                    <option value="Resource Quota Scaling">High-Throughput Quota & Tier Upgrade</option>
                  </select>
                </div>

                <div className="rounded-lg bg-muted/40 p-3 text-[11px] text-muted-foreground space-y-1">
                  <div className="flex items-center gap-1.5 font-medium text-foreground">
                    <Clock className="h-3.5 w-3.5 text-primary" /> 15-Minute Guaranteed Response Window
                  </div>
                  <p>
                    Direct routing to an EMEA-based Senior Customer Success Manager with full access to AetherHost cluster telemetry.
                  </p>
                </div>

                <button
                  type="submit"
                  disabled={status === 'loading'}
                  className="w-full flex items-center justify-center gap-2 rounded-lg bg-primary py-2.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 transition-all disabled:opacity-50"
                >
                  {status === 'loading' ? 'Routing to Chili Piper...' : 'Launch Chili Piper Instant Booker'}
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  )
}
