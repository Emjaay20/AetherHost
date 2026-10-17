'use client'

import { useState, useMemo } from 'react'
import { Activity, Search, Sparkles, Server, CreditCard, ChevronDown, Filter } from 'lucide-react'
import { age } from './format'
import type { Overview } from './types'

type TimelineEvent = Overview['timeline'][number]

type EventCategory = 'all' | 'provisioning' | 'ai' | 'billing'

export function ProvisioningTimeline({ timeline }: { timeline: TimelineEvent[] }) {
  const [category, setCategory] = useState<EventCategory>('all')
  const [search, setSearch] = useState('')

  const counts = useMemo(() => {
    return {
      all: timeline.length,
      provisioning: timeline.filter((e) => isProvisioning(e.eventName)).length,
      ai: timeline.filter((e) => isAi(e.eventName)).length,
      billing: timeline.filter((e) => isBilling(e.eventName)).length,
    }
  }, [timeline])

  const filtered = useMemo(() => {
    return timeline.filter((event) => {
      // Category filter
      if (category === 'provisioning' && !isProvisioning(event.eventName)) return false
      if (category === 'ai' && !isAi(event.eventName)) return false
      if (category === 'billing' && !isBilling(event.eventName)) return false

      // Search filter
      if (search.trim()) {
        const q = search.toLowerCase()
        const matchesName = event.eventName.toLowerCase().includes(q)
        const matchesTenant = event.tenantName.toLowerCase().includes(q)
        const matchesApp = event.applicationName?.toLowerCase().includes(q)
        if (!matchesName && !matchesTenant && !matchesApp) return false
      }

      return true
    })
  }, [timeline, category, search])

  return (
    <div className="flex flex-col h-[380px]">
      {/* Header Controls: Filters + Search */}
      <div className="p-3 border-b border-border/40 bg-muted/20 flex flex-wrap items-center justify-between gap-2 shrink-0">
        <div className="flex flex-wrap items-center gap-1.5">
          <FilterPill
            label="All"
            count={counts.all}
            active={category === 'all'}
            onClick={() => setCategory('all')}
          />
          <FilterPill
            label="Deploys"
            count={counts.provisioning}
            active={category === 'provisioning'}
            onClick={() => setCategory('provisioning')}
            icon={<Server className="h-3 w-3" />}
          />
          <FilterPill
            label="AI"
            count={counts.ai}
            active={category === 'ai'}
            onClick={() => setCategory('ai')}
            icon={<Sparkles className="h-3 w-3" />}
          />
          <FilterPill
            label="Billing"
            count={counts.billing}
            active={category === 'billing'}
            onClick={() => setCategory('billing')}
            icon={<CreditCard className="h-3 w-3" />}
          />
        </div>

        <div className="relative w-full sm:w-44">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search events..."
            className="w-full pl-8 pr-3 py-1 text-xs rounded-lg border border-border/60 bg-background/80 focus:outline-none focus:ring-1 focus:ring-primary text-foreground placeholder:text-muted-foreground/60"
          />
        </div>
      </div>

      {/* Scrollable Event List */}
      <div className="flex-1 overflow-y-auto divide-y divide-border/40 scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full p-6 text-center text-muted-foreground">
            <Activity className="h-8 w-8 mb-2 opacity-30" />
            <p className="text-sm font-medium">No matching domain events</p>
            <p className="text-xs text-muted-foreground/80 mt-0.5">
              {search ? 'Try clearing your search query.' : 'Events will appear here as activity occurs.'}
            </p>
          </div>
        ) : (
          filtered.map((event) => {
            const status = getEventStatus(event.eventName)
            return (
              <div
                key={event.id}
                className="px-4 py-3 flex items-start gap-3 hover:bg-muted/30 transition-colors group"
              >
                {/* Event Status Indicator */}
                <div className="mt-1 shrink-0">
                  <span className={`inline-block w-2 h-2 rounded-full ${status.dotColor}`} />
                </div>

                {/* Event Details */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-mono font-medium truncate text-foreground group-hover:text-primary transition-colors">
                      {formatEventName(event.eventName)}
                    </p>
                    <span className="text-[11px] font-mono text-muted-foreground shrink-0 tabular-nums">
                      {age(secondsSince(event.createdAt))}
                    </span>
                  </div>

                  <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                    <span className="font-medium text-foreground/80">{event.tenantName}</span>
                    {event.applicationName && (
                      <>
                        <span className="mx-1 text-muted-foreground/60">&middot;</span>
                        <span className="text-primary/90">{event.applicationName}</span>
                      </>
                    )}
                    {event.payload?.from && event.payload?.to && (
                      <>
                        <span className="mx-1 text-muted-foreground/60">&middot;</span>
                        <span className="font-mono text-[10px]">
                          {String(event.payload.from)} &rarr; {String(event.payload.to)}
                        </span>
                      </>
                    )}
                    {event.payload?.planId && (
                      <>
                        <span className="mx-1 text-muted-foreground/60">&middot;</span>
                        <span className="uppercase text-[10px] tracking-wide font-medium bg-primary/10 text-primary px-1.5 py-0.5 rounded border border-primary/20">
                          {String(event.payload.planId)}
                        </span>
                      </>
                    )}
                  </p>
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* Footer Info */}
      <div className="p-2.5 px-4 border-t border-border/40 bg-muted/10 flex items-center justify-between text-[11px] text-muted-foreground shrink-0">
        <span>Showing {filtered.length} of {timeline.length} events</span>
        <span className="font-mono text-[10px]">Auto-scroll enabled</span>
      </div>
    </div>
  )
}

function FilterPill({
  label,
  count,
  active,
  onClick,
  icon,
}: {
  label: string
  count: number
  active: boolean
  onClick: () => void
  icon?: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-all ${
        active
          ? 'bg-primary text-primary-foreground shadow-sm'
          : 'bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground'
      }`}
    >
      {icon}
      <span>{label}</span>
      <span
        className={`text-[10px] tabular-nums px-1.5 py-0.2 rounded-full ${
          active ? 'bg-primary-foreground/20 text-primary-foreground' : 'bg-muted text-muted-foreground'
        }`}
      >
        {count}
      </span>
    </button>
  )
}

function isProvisioning(name: string) {
  return name.includes('Provisioning') || name.includes('Application') || name.includes('Workload')
}

function isAi(name: string) {
  return name.includes('Ai') || name.includes('Model') || name.includes('Prompt')
}

function isBilling(name: string) {
  return name.includes('Subscription') || name.includes('Payment') || name.includes('Invoice') || name.includes('Billing')
}

function formatEventName(name: string) {
  // Convert camelCase / PascalCase to clean readable string if desired or keep clean
  return name
    .replace(/([A-Z])/g, ' $1')
    .trim()
}

function getEventStatus(name: string) {
  const lower = name.toLowerCase()
  if (lower.includes('failed') || lower.includes('error')) {
    return { dotColor: 'bg-rose-500' }
  }
  if (lower.includes('completed') || lower.includes('success') || lower.includes('ready') || lower.includes('active')) {
    return { dotColor: 'bg-emerald-500' }
  }
  if (lower.includes('requested') || lower.includes('started') || lower.includes('iteration')) {
    return { dotColor: 'bg-blue-500' }
  }
  return { dotColor: 'bg-slate-400' }
}

function secondsSince(iso: string) {
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000))
}
