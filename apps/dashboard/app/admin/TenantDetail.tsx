import type { ReactNode } from 'react'
import PlanControl from './PlanControl'
import { AdminTenantActions } from './AdminTenantActions'
import { MeterBar, Panel, PlanPill, Section, StatusPill } from './ui'
import { age, money, pct, when } from './format'
import type { TenantDetail } from './types'

export default function TenantDetailView({ detail }: { detail: TenantDetail }) {
  const { tenant } = detail
  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">{tenant.name}</h1>
            <PlanPill planId={tenant.planId} />
            <StatusPill status={tenant.subscriptionStatus} />
          </div>
          <p className="mt-1 font-mono text-xs text-muted-foreground">{tenant.id}</p>
          <p className="mt-1 text-xs text-muted-foreground">Opened {when(tenant.createdAt)} · saturation {pct(detail.score)} · {detail.tokens.toLocaleString()} AI tokens</p>
        </div>
        <div className="flex items-center gap-2">
          <AdminTenantActions
            tenantId={tenant.id}
            tenantName={tenant.name}
            currentStatus={tenant.subscriptionStatus}
          />
        </div>
      </div>

      {detail.webhooks.length === 0 && tenant.subscriptionStatus === 'active' && (
        <p className="text-xs text-amber-400">No billing event recorded. active is the schema default, not proof of payment.</p>
      )}
      {(detail.drift.length > 0 || detail.counterDrift) && (
        <Panel className="p-4 border-amber-500/30">
          <p className="text-sm text-amber-300">
            Catalog drift: {detail.drift.length ? detail.drift.join(', ') : 'none'}
            {detail.counterDrift ? ' · enforced application counter ≠ application rows' : ''}
          </p>
        </Panel>
      )}

      <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-3">
        <MeterCard label="Applications" hint="enforced / limit" meter={<MeterBar meter={detail.meters.applications} counted={detail.meters.applications.counted} />} />
        <MeterCard label="AI requests" hint="metered on success only" meter={<MeterBar meter={detail.meters.aiRequests} />} />
        <MeterCard label="Storage MB" hint="entitlement row" meter={<MeterBar meter={detail.meters.storageMb} />} />
        <MeterCard label="Bandwidth GB" hint="max(gb, mb/1024)" meter={<MeterBar meter={detail.meters.bandwidthGb} />} />
      </div>

      <Section kicker="Operator" title="Apply catalog plan">
        <PlanControl tenantId={tenant.id} currentPlan={tenant.planId} drift={detail.drift} catalog={detail.catalog} />
      </Section>

      <Section kicker="Workloads" title="Applications">
        <Panel className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-[11px] uppercase tracking-wide text-muted-foreground">
              <tr className="border-b border-border/50">
                <th className="p-3 font-medium">App</th>
                <th className="p-3 font-medium">Status</th>
                <th className="p-3 font-medium">Runtime</th>
                <th className="p-3 font-medium">Contract</th>
                <th className="p-3 font-medium">Age</th>
              </tr>
            </thead>
            <tbody>
              {detail.apps.map((app) => (
                <tr key={app.id} className="border-b border-border/40 last:border-0">
                  <td className="p-3">
                    <p className="font-medium">{app.name}</p>
                    <p className="text-[11px] font-mono text-muted-foreground">{app.id}</p>
                  </td>
                  <td className="p-3"><StatusPill status={app.status} /></td>
                  <td className="p-3 text-xs font-mono">{app.runtime}</td>
                  <td className="p-3 text-[11px] text-muted-foreground space-y-1">
                    <p>{app.healthPath} :{app.port}</p>
                    {app.workerCommand && <p className="font-mono truncate max-w-xs">worker {app.workerCommand}</p>}
                    <p>
                      {app.withPostgres ? 'postgres ' : ''}
                      {app.withRedis ? 'redis ' : ''}
                      {app.customDomain ?? app.githubRepo ?? app.dockerImage ?? 'no source'}
                    </p>
                  </td>
                  <td className="p-3 text-xs tabular-nums text-muted-foreground">{age(app.ageSeconds)}</td>
                </tr>
              ))}
              {detail.apps.length === 0 && (
                <tr><td colSpan={5} className="p-6 text-sm text-muted-foreground">No applications. Quota has not been consumed.</td></tr>
              )}
            </tbody>
          </table>
        </Panel>
      </Section>

      <div className="grid lg:grid-cols-2 gap-4">
        <RecordList title="Invoices" empty="No invoices. Starter applies write none.">
          {detail.invoices.map((invoice) => (
            <Record
              key={invoice.id}
              title={`${invoice.provider} · ${money(invoice.amountDollars)}`}
              meta={`${invoice.status} · ${invoice.invoiceId} · ${when(invoice.createdAt)}`}
            />
          ))}
        </RecordList>
        <RecordList title="Webhook events" empty="No provider events for this tenant.">
          {detail.webhooks.map((event) => (
            <Record
              key={event.id}
              title={`${event.provider} · ${event.planId}`}
              meta={`${event.status} · ${event.providerEventId} · ${when(event.createdAt)}`}
            />
          ))}
        </RecordList>
        <RecordList title="Audit log" empty="No audited mutations.">
          {detail.audits.map((log) => (
            <Record
              key={log.id}
              title={log.action}
              meta={`${when(log.createdAt)}${log.metadata ? ` · ${JSON.stringify(log.metadata)}` : ''}`}
            />
          ))}
        </RecordList>
        <RecordList title="Domain events" empty="No events for this tenant.">
          {detail.events.map((event) => (
            <Record
              key={event.id}
              title={event.eventName}
              meta={`${event.applicationName ?? 'tenant'} · ${when(event.createdAt)}${event.payload ? ` · ${JSON.stringify(event.payload)}` : ''}`}
            />
          ))}
        </RecordList>
      </div>
    </>
  )
}

function MeterCard({ label, hint, meter }: { label: string; hint: string; meter: ReactNode }) {
  return (
    <Panel className="p-4">
      <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">{label}</p>
      <div className="mt-3">{meter}</div>
      <p className="mt-2 text-[11px] text-muted-foreground">{hint}</p>
    </Panel>
  )
}

function RecordList({ title, empty, children }: { title: string; empty: string; children: ReactNode }) {
  const emptyNode = Array.isArray(children) ? children.length === 0 : !children
  return (
    <Section kicker="Record" title={title}>
      <Panel className="divide-y divide-border/40">
        {emptyNode ? <p className="p-4 text-sm text-muted-foreground">{empty}</p> : children}
      </Panel>
    </Section>
  )
}

function Record({ title, meta }: { title: string; meta: string }) {
  return (
    <div className="px-4 py-3">
      <p className="text-sm font-mono">{title}</p>
      <p className="text-[11px] text-muted-foreground break-all">{meta}</p>
    </div>
  )
}
