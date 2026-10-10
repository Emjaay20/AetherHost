import type { ReactNode } from 'react'
import Link from 'next/link'
import SyncDirectory from './SyncDirectory'
import { MrrChart, CohortChart } from './AdminCharts'
import { AdminTenantActions } from './AdminTenantActions'
import { GlobalConfigPanel } from './GlobalConfigPanel'
import { MeterBar, Panel, PlanPill, Section, StatusPill, TenantLink } from './ui'
import { age, clock, money, pageHref, pct, when } from './format'
import type { Overview, TenantPage } from './types'

const FLEET = ['running', 'pending', 'failed', 'suspended', 'terminating'] as const

export default function OverviewBoard({
  overview,
  directory,
  q,
}: {
  overview: Overview
  directory: TenantPage
  q: string
}) {
  const counts = overview.fleet.counts
  const other = Object.entries(counts)
    .filter(([status]) => !FLEET.includes(status as (typeof FLEET)[number]))
    .reduce((sum, [, count]) => sum + count, 0)

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 text-[11px]">
        <Signal ok={overview.postgres === 'ok'} label={overview.postgres === 'ok' ? 'postgres ready' : 'postgres not ready'} />
        <Signal
          ok={overview.queue.available}
          label={overview.queue.available
            ? `queue ${overview.queue.counts?.waiting ?? 0} waiting · ${overview.queue.counts?.failed ?? 0} failed`
            : 'redis unreachable'}
        />
        <Signal ok={overview.driftCount === 0} label={`${overview.driftCount} drifted`} />
        <span className="ml-auto font-mono text-muted-foreground">as of {clock(overview.generatedAt)}</span>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 rounded-2xl border border-border/50 overflow-hidden bg-card/80">
        {FLEET.map((status) => (
          <FleetCell key={status} label={status} value={counts[status] ?? 0} />
        ))}
        <FleetCell
          label="oldest pending"
          value={overview.fleet.oldestPending ? age(overview.fleet.oldestPending.ageSeconds) : '—'}
          hint={overview.fleet.oldestPending?.name}
        />
        {other > 0 && <FleetCell label="other" value={other} />}
      </div>

      <GlobalConfigPanel system={overview.system} />

      <div className="grid lg:grid-cols-5 gap-4">
        <Panel className="lg:col-span-3 p-5 space-y-5">
          <div className="grid sm:grid-cols-2 gap-4">
            <Number
              label="Contracted MRR"
              value={money(overview.billing.contractedMrrDollars)}
              hint="Catalog price of non-cancelled tenants"
            />
            <Number
              label={`Recognized ${overview.billing.recognizedMonth}`}
              value={money(overview.billing.recognizedMrrDollars)}
              hint="Paid invoices this month, not a forecast"
            />
          </div>
          <div className="grid sm:grid-cols-3 gap-4 text-sm">
            <Count label="Past due" value={overview.billing.pastDueTenants} />
            <Count label="Cancelled" value={overview.billing.cancelledTenants} />
            <Count label="Webhook events" value={overview.billing.webhookTotal} />
          </div>
          <div className="grid sm:grid-cols-2 gap-6">
            <Mix title="Invoices" rows={overview.billing.invoices.map((row) => ({
              label: row.status,
              detail: `${row.count} · ${money(row.amountDollars)}`,
            }))} />
            <Mix title="Webhook status" rows={overview.billing.webhooks.map((row) => ({
              label: row.status,
              detail: String(row.count),
            }))} />
          </div>
          <p className="text-[11px] text-muted-foreground">
            Replays never insert a second WebhookEvent. Queue failed count is the retry signal, not a stored replay counter.
          </p>
        </Panel>

        <Panel className="lg:col-span-2 p-5 space-y-5">
          {!overview.analytics.available && (
            <p className="text-xs text-amber-400">Analytics views unavailable. Fleet and billing totals above are live table reads.</p>
          )}
          <div className="mb-6">
            <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground mb-1">Paid invoice volume</p>
            <MrrChart data={overview.analytics.mrrByMonth.slice(-6)} />
          </div>
          <div className="mb-6">
            <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground mb-1">Cohorts</p>
            <CohortChart data={overview.analytics.cohorts.slice(0, 6)} />
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground mb-2">Top AI consumers</p>
            <div className="space-y-2">
              {overview.analytics.aiUsage.length === 0 && <p className="text-xs text-muted-foreground">No metered requests.</p>}
              {overview.analytics.aiUsage.map((row) => (
                <div key={row.tenantId} className="flex items-center justify-between gap-3 text-sm">
                  <TenantLink id={row.tenantId} name={row.tenantName} />
                  <span className="text-xs tabular-nums text-muted-foreground shrink-0">
                    {row.requests.toLocaleString()} req · {row.tokens.toLocaleString()} tok
                  </span>
                </div>
              ))}
            </div>
          </div>
        </Panel>
      </div>

      <Section kicker="Entitlements" title="Quota saturation">
        <Panel className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-[11px] uppercase tracking-wide text-muted-foreground">
              <tr className="border-b border-border/50">
                <th className="p-3 font-medium">Tenant</th>
                <th className="p-3 font-medium">Plan</th>
                <th className="p-3 font-medium">Score</th>
                <th className="p-3 font-medium">Apps</th>
                <th className="p-3 font-medium">AI</th>
                <th className="p-3 font-medium">Storage</th>
                <th className="p-3 font-medium">Bandwidth</th>
                <th className="p-3 font-medium">Drift</th>
              </tr>
            </thead>
            <tbody>
              {overview.saturation.map((tenant) => (
                <tr key={tenant.id} className="border-b border-border/40 last:border-0">
                  <td className="p-3"><TenantLink id={tenant.id} name={tenant.name} /></td>
                  <td className="p-3"><PlanPill planId={tenant.planId} /></td>
                  <td className="p-3 tabular-nums">{pct(tenant.score)}</td>
                  <td className="p-3"><MeterBar meter={tenant.meters.applications} counted={tenant.meters.applications.counted} /></td>
                  <td className="p-3"><MeterBar meter={tenant.meters.aiRequests} /></td>
                  <td className="p-3"><MeterBar meter={tenant.meters.storageMb} /></td>
                  <td className="p-3"><MeterBar meter={tenant.meters.bandwidthGb} /></td>
                  <td className="p-3">
                    <Drift drift={tenant.drift} counter={tenant.counterDrift} />
                  </td>
                </tr>
              ))}
              {overview.saturation.length === 0 && (
                <tr><td colSpan={8} className="p-6 text-sm text-muted-foreground">No tenants in Postgres. Reads do not import Clerk users.</td></tr>
              )}
            </tbody>
          </table>
        </Panel>
      </Section>

      <div className="grid lg:grid-cols-2 gap-4">
        <Section kicker="Events" title="Provisioning timeline">
          <Panel className="divide-y divide-border/40">
            {overview.timeline.length === 0 && <p className="p-4 text-sm text-muted-foreground">No domain events.</p>}
            {overview.timeline.map((event) => (
              <div key={event.id} className="px-4 py-3 flex gap-3">
                <span className="w-14 shrink-0 text-[11px] font-mono text-muted-foreground">{age(secondsSince(event.createdAt))}</span>
                <div className="min-w-0">
                  <p className="text-sm font-mono truncate">{event.eventName}</p>
                  <p className="text-[11px] text-muted-foreground truncate">
                    {event.tenantName}
                    {event.applicationName ? ` · ${event.applicationName}` : ''}
                    {event.payload?.from && event.payload?.to ? ` · ${event.payload.from} → ${event.payload.to}` : ''}
                    {event.payload?.planId ? ` · ${event.payload.planId}` : ''}
                  </p>
                </div>
              </div>
            ))}
          </Panel>
        </Section>
        <Section kicker="Agent" title="Unclaimed and failed">
          <Panel className="p-4 space-y-4">
            <WorkList
              title="Pending > 5m"
              empty="No stuck deploys."
              rows={overview.fleet.stuckPending.map((app) => ({
                href: `/admin/tenants/${app.tenantId}`,
                title: app.name,
                meta: `${app.tenantName} · ${app.runtime} · ${age(app.ageSeconds)}`,
              }))}
            />
            <WorkList
              title="Health probe failed"
              empty="No failed workloads. Probe errors are not stored, only status."
              rows={overview.fleet.recentFailed.map((app) => ({
                href: `/admin/tenants/${app.tenantId}`,
                title: app.name,
                meta: `${app.tenantName} · ${app.runtime} · ${app.healthPath}`,
              }))}
            />
          </Panel>
        </Section>
      </div>

      <Section
        kicker="Directory"
        title="Tenants"
        action={<SyncDirectory />}
      >
        <Panel>
          <div className="p-4 border-b border-border/50 flex items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <form action="/admin" className="relative">
                <input
                  name="q"
                  defaultValue={q}
                  placeholder="Search name or id"
                  className="w-64 pl-3 pr-3 py-2 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
              </form>
              <div className="hidden md:flex gap-2">
                <Link href="/admin" className={`px-3 py-1.5 text-xs rounded-full border ${!q ? 'bg-primary/10 text-primary border-primary/30' : 'border-transparent text-muted-foreground hover:bg-muted'}`}>All</Link>
                <Link href="/admin?q=growth" className={`px-3 py-1.5 text-xs rounded-full border ${q === 'growth' ? 'bg-primary/10 text-primary border-primary/30' : 'border-transparent text-muted-foreground hover:bg-muted'}`}>Growth Plan</Link>
                <Link href="/admin?q=past_due" className={`px-3 py-1.5 text-xs rounded-full border ${q === 'past_due' ? 'bg-amber-500/10 text-amber-500 border-amber-500/30' : 'border-transparent text-muted-foreground hover:bg-muted'}`}>Past Due</Link>
              </div>
            </div>
            <p className="text-xs text-muted-foreground tabular-nums">{directory.meta.total} tenants</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-[11px] uppercase tracking-wide text-muted-foreground">
                <tr className="border-b border-border/50">
                  <th className="p-3 font-medium">Tenant</th>
                  <th className="p-3 font-medium">Status</th>
                  <th className="p-3 font-medium">Plan</th>
                  <th className="p-3 font-medium">Apps</th>
                  <th className="p-3 font-medium">AI</th>
                  <th className="p-3 font-medium">Opened</th>
                  <th className="p-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {directory.data.map((tenant) => (
                  <tr key={tenant.id} className="border-b border-border/40 last:border-0 hover:bg-muted/20">
                    <td className="p-3"><TenantLink id={tenant.id} name={tenant.name} /></td>
                    <td className="p-3"><StatusPill status={tenant.subscriptionStatus} /></td>
                    <td className="p-3"><PlanPill planId={tenant.planId} /></td>
                    <td className="p-3"><MeterBar meter={tenant.meters.applications} counted={tenant.meters.applications.counted} /></td>
                    <td className="p-3 tabular-nums text-muted-foreground">{tenant.meters.aiRequests.used}/{tenant.meters.aiRequests.limit}</td>
                    <td className="p-3 text-xs text-muted-foreground">{when(tenant.createdAt)}</td>
                    <td className="p-3 text-right">
                      <AdminTenantActions
                        tenantId={tenant.id}
                        tenantName={tenant.name}
                        currentStatus={tenant.subscriptionStatus}
                      />
                    </td>
                  </tr>
                ))}
                {directory.data.length === 0 && (
                  <tr>
                    <td colSpan={7} className="p-8 text-sm text-muted-foreground">
                      {q ? 'No tenant matches that query.' : 'Directory is empty. Reconcile Clerk to upsert users. This page does not write on read.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="p-3 border-t border-border/50 flex justify-end gap-2 text-xs">
            {directory.meta.skip > 0 ? (
              <Link className="px-3 py-1.5 rounded-lg border border-border/60" href={pageHref(q, Math.max(0, directory.meta.skip - directory.meta.take))}>Previous</Link>
            ) : (
              <span className="px-3 py-1.5 rounded-lg border border-border/30 text-muted-foreground">Previous</span>
            )}
            {directory.meta.hasMore ? (
              <Link className="px-3 py-1.5 rounded-lg border border-border/60" href={pageHref(q, directory.meta.skip + directory.meta.take)}>Next</Link>
            ) : (
              <span className="px-3 py-1.5 rounded-lg border border-border/30 text-muted-foreground">Next</span>
            )}
          </div>
        </Panel>
      </Section>

      <p className="text-[11px] leading-relaxed text-muted-foreground font-mono">
        Reads do not write. Plan apply is processWebhook(provider=operator). Drift is catalog limit ≠ TenantEntitlement. The app bar uses usageApplications, the number the quota UPDATE checks. Stuck means pending &gt; 5m. Failed is the only health-probe record.
      </p>
    </>
  )
}

function Signal({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className={`inline-flex items-center gap-2 px-2.5 py-1 rounded-full border ${ok ? 'border-green-500/20 text-green-400' : 'border-amber-500/20 text-amber-400'}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${ok ? 'bg-green-400' : 'bg-amber-400'}`} />
      {label}
    </span>
  )
}

function FleetCell({ label, value, hint }: { label: string; value: number | string; hint?: string }) {
  return (
    <div className="p-4 border-b xl:border-b-0 border-r border-border/40 last:border-r-0">
      <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">{label}</p>
      <p className="mt-2 text-2xl font-semibold tabular-nums tracking-tight">{value}</p>
      {hint && <p className="mt-1 text-[11px] text-muted-foreground truncate">{hint}</p>}
    </div>
  )
}

function Number({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">{label}</p>
      <p className="mt-1 text-3xl font-semibold tabular-nums tracking-tight">{value}</p>
      <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p>
    </div>
  )
}

function Count({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-border/40 px-3 py-2">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold tabular-nums">{value}</p>
    </div>
  )
}

function Mix({ title, rows }: { title: string; rows: Array<{ label: string; detail: string }> }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground mb-2">{title}</p>
      {rows.length === 0 && <p className="text-xs text-muted-foreground">None</p>}
      <div className="space-y-1.5">
        {rows.map((row) => (
          <div key={row.label} className="flex items-center justify-between text-sm">
            <StatusPill status={row.label} />
            <span className="text-xs tabular-nums text-muted-foreground">{row.detail}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function Series({ title, empty, children }: { title: string; empty: string; children: ReactNode }) {
  const emptyNode = Array.isArray(children) ? children.length === 0 : !children
  return (
    <div>
      <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground mb-2">{title}</p>
      {emptyNode ? <p className="text-xs text-muted-foreground">{empty}</p> : <div className="space-y-1.5">{children}</div>}
    </div>
  )
}

function Bar({ label, width, detail }: { label: string; width: number; detail: string }) {
  return (
    <div className="grid grid-cols-[4.5rem_1fr_auto] items-center gap-2 text-[11px]">
      <span className="font-mono text-muted-foreground">{label}</span>
      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
        <div className="h-full bg-primary" style={{ width: `${Math.max(4, Math.round(width * 100))}%` }} />
      </div>
      <span className="tabular-nums text-muted-foreground">{detail}</span>
    </div>
  )
}

function Drift({ drift, counter }: { drift: string[]; counter: boolean }) {
  if (drift.length === 0 && !counter) return <span className="text-xs text-muted-foreground">clean</span>
  return (
    <div className="flex flex-wrap gap-1">
      {drift.map((field) => (
        <span key={field} className="px-1.5 py-0.5 rounded border border-amber-500/20 text-[10px] text-amber-400">{field}</span>
      ))}
      {counter && <span className="px-1.5 py-0.5 rounded border border-amber-500/20 text-[10px] text-amber-400">counter</span>}
    </div>
  )
}

function WorkList({ title, empty, rows }: { title: string; empty: string; rows: Array<{ href: string; title: string; meta: string }> }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground mb-2">{title}</p>
      {rows.length === 0 && <p className="text-xs text-muted-foreground">{empty}</p>}
      <div className="space-y-2">
        {rows.map((row) => (
          <Link key={row.title + row.meta} href={row.href} className="block rounded-xl border border-border/40 px-3 py-2 hover:border-border">
            <p className="text-sm font-medium">{row.title}</p>
            <p className="text-[11px] text-muted-foreground">{row.meta}</p>
          </Link>
        ))}
      </div>
    </div>
  )
}

function secondsSince(iso: string) {
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000))
}
