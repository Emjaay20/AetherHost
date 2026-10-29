'use client'

import { useState } from 'react'
import { Calendar, ArrowRight, X, CheckCircle2, ShieldCheck, Sparkles } from 'lucide-react'
import { submitChiliPiperConcierge } from '../lib/chilipiper'

interface ChiliPiperConciergeModalProps {
  isOpen: boolean
  onClose: () => void
}

export default function ChiliPiperConciergeModal({ isOpen, onClose }: ChiliPiperConciergeModalProps) {
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    company: '',
    workloads: '10-50',
    region: 'EMEA' as 'EMEA' | 'AMER' | 'APAC',
  })
  const [status, setStatus] = useState<'idle' | 'routing' | 'success' | 'fallback'>('idle')

  if (!isOpen) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setStatus('routing')

    const success = await submitChiliPiperConcierge(
      'aetherhost',
      'inbound-enterprise-router',
      {
        Email: formData.email,
        FirstName: formData.firstName,
        LastName: formData.lastName,
        Company: formData.company,
        Region: formData.region,
        Estimated_Workloads__c: parseInt(formData.workloads.split('-')[0] || '10', 10),
      },
      {
        onSuccess: () => {
          setStatus('success')
        },
        onError: () => {
          setStatus('fallback')
        },
      }
    )

    if (!success) {
      setStatus('fallback')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg rounded-2xl border border-border/70 bg-card p-6 shadow-2xl">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="flex items-center gap-3 mb-5">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-tr from-primary to-blue-500 text-white shadow-md">
            <Sparkles className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-foreground">AetherHost Enterprise Onboarding</h3>
            <p className="text-xs text-muted-foreground">Direct calendar routing via Chili Piper Form Concierge</p>
          </div>
        </div>

        {status === 'success' ? (
          <div className="py-8 text-center space-y-3">
            <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-400" />
            <h4 className="text-base font-semibold text-foreground">Session Booked Instantly!</h4>
            <p className="text-xs text-muted-foreground max-w-sm mx-auto">
              You are confirmed with our Senior Customer Success Manager (EMEA). A calendar invite and architecture
              worksheet have been sent to {formData.email}.
            </p>
            <button
              type="button"
              onClick={onClose}
              className="mt-4 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground"
            >
              Done
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-foreground mb-1">First Name</label>
                <input
                  type="text"
                  required
                  value={formData.firstName}
                  onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                  placeholder="Jane"
                  className="w-full rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-foreground mb-1">Last Name</label>
                <input
                  type="text"
                  required
                  value={formData.lastName}
                  onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                  placeholder="Doe"
                  className="w-full rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-foreground mb-1">Corporate Email</label>
              <input
                type="email"
                required
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                placeholder="jane@company.com"
                className="w-full rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-foreground mb-1">Company Name</label>
                <input
                  type="text"
                  required
                  value={formData.company}
                  onChange={(e) => setFormData({ ...formData, company: e.target.value })}
                  placeholder="Acme EMEA Ltd"
                  className="w-full rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-foreground mb-1">Region</label>
                <select
                  value={formData.region}
                  onChange={(e) => setFormData({ ...formData, region: e.target.value as any })}
                  className="w-full rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  <option value="EMEA">EMEA (London, Berlin, Paris)</option>
                  <option value="AMER">AMER (New York, SF)</option>
                  <option value="APAC">APAC (Singapore, Tokyo)</option>
                </select>
              </div>
            </div>

            <div className="rounded-lg bg-muted/30 border border-border/40 p-3 text-[11px] text-muted-foreground flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-emerald-400 shrink-0" />
              <span>Chili Piper will instantly qualify and load our EMEA CSM team's real-time availability.</span>
            </div>

            <button
              type="submit"
              disabled={status === 'routing'}
              className="w-full flex items-center justify-center gap-2 rounded-lg bg-primary py-2.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 transition-all disabled:opacity-50"
            >
              {status === 'routing' ? (
                'Connecting to Chili Piper...'
              ) : (
                <>
                  <Calendar className="h-4 w-4" /> Schedule Onboarding Call Instantly
                </>
              )}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
