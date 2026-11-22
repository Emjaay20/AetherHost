'use client'

import { CheckCircle2, Circle, Globe2, HeartPulse, Rocket } from 'lucide-react'
import CreateAppForm from './CreateAppForm'

type AppSummary = {
  id: string
  status: string
  customDomain?: string | null
}

export default function OnboardingChecklist({
  apps,
  limitReached,
}: {
  apps: AppSummary[]
  limitReached: boolean
}) {
  const hasApplication = apps.length > 0
  const hasHealthyApplication = apps.some((app) => app.status === 'running')
  const hasDomainConfigured = apps.some((app) => Boolean(app.customDomain))
  const completeCount = [true, hasApplication, hasHealthyApplication, hasDomainConfigured].filter(Boolean).length

  if (completeCount === 4) return null

  const steps = [
    { label: 'Workspace created', detail: 'Your AetherHost account is ready.', complete: true, icon: CheckCircle2 },
    { label: 'Deploy your first application', detail: 'Start from a repository, image, WordPress, or a template.', complete: hasApplication, icon: Rocket },
    { label: 'Verify availability', detail: 'A deployment becomes complete when runtime health evidence reports healthy.', complete: hasHealthyApplication, icon: HeartPulse },
    { label: 'Add a custom domain', detail: hasDomainConfigured ? 'Domain configured. Confirm DNS and TLS from the application controls.' : 'Optional: connect your own domain when the application is ready.', complete: hasDomainConfigured, icon: Globe2 },
  ]

  return (
    <section className="rounded-lg border border-border bg-card">
      <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Getting started</p>
          <h2 className="mt-1 text-base font-semibold text-foreground">Get your first application online</h2>
        </div>
        <span className="rounded-md border border-border bg-muted px-2 py-1 text-xs font-medium text-muted-foreground">{completeCount} of {steps.length} complete</span>
      </div>
      <ol className="divide-y divide-border">
        {steps.map((step, index) => {
          const Icon = step.complete ? CheckCircle2 : Circle
          return (
            <li key={step.label} className="flex items-center gap-3 px-4 py-3">
              <Icon className={step.complete ? 'h-4 w-4 shrink-0 text-emerald-500' : 'h-4 w-4 shrink-0 text-muted-foreground'} />
              <div className="min-w-0 flex-1">
                <p className={step.complete ? 'text-xs font-medium text-foreground' : 'text-xs font-semibold text-foreground'}>{step.label}</p>
                <p className="mt-0.5 text-xs leading-4 text-muted-foreground">{step.detail}</p>
              </div>
              {index === 1 && !step.complete && <CreateAppForm limitReached={limitReached} />}
            </li>
          )
        })}
      </ol>
    </section>
  )
}
