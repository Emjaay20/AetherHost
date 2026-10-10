import type { ReactNode } from 'react'
import Link from 'next/link'
import { barTone, planClass, statusClass } from './format'
import type { Meter } from './types'

export function Pill({ value, className }: { value: string; className?: string }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md border text-[10px] font-medium uppercase tracking-wide ${className ?? statusClass(value)}`}>
      {value}
    </span>
  )
}

export function PlanPill({ planId }: { planId: string }) {
  return <Pill value={planId} className={planClass(planId)} />
}

export function StatusPill({ status }: { status: string }) {
  return <Pill value={status} />
}

export function MeterBar({ meter, counted }: { meter: Meter; counted?: number }) {
  const width = Math.min(100, Math.round(meter.ratio * 100))
  return (
    <div className="min-w-[7.5rem]">
      <div className="flex items-center gap-2">
        <div className="h-1 flex-1 bg-muted rounded-full overflow-hidden">
          <div className={`h-full ${barTone(meter.ratio)}`} style={{ width: `${width}%` }} />
        </div>
        <span className="text-[11px] tabular-nums text-muted-foreground">
          {formatUsed(meter.used)}/{formatUsed(meter.limit)}
        </span>
      </div>
      {counted !== undefined && counted !== meter.used && (
        <p className="text-[10px] text-amber-400 mt-1">rows {counted}</p>
      )}
    </div>
  )
}

function formatUsed(value: number) {
  if (Number.isInteger(value)) return value.toLocaleString()
  return value.toFixed(1)
}

export function Section({
  kicker,
  title,
  action,
  children,
}: {
  kicker: string
  title: string
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{kicker}</p>
          <h2 className="text-lg font-semibold tracking-tight mt-1">{title}</h2>
        </div>
        {action}
      </div>
      {children}
    </section>
  )
}

export function Panel({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl border border-border/50 bg-card/80 ${className}`}>
      {children}
    </div>
  )
}

export function TenantLink({ id, name }: { id: string; name: string }) {
  return (
    <Link href={`/admin/tenants/${id}`} className="group block min-w-0">
      <p className="font-medium truncate group-hover:text-primary transition-colors">{name}</p>
      <p className="text-[11px] font-mono text-muted-foreground truncate">{id}</p>
    </Link>
  )
}
