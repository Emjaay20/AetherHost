'use client'

import { useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import ApplicationCardItem, { type ApplicationItem } from './ApplicationCardItem'

type StatusFilter = 'all' | 'running' | 'failed'

function statusRank(status: string) {
  switch (status) {
    case 'failed':
      return 0
    case 'pending':
    case 'provisioning':
    case 'deploying':
      return 1
    case 'running':
      return 2
    default:
      return 3
  }
}

export default function DeploymentList({
  apps,
  deleteAction,
}: {
  apps: ApplicationItem[]
  deleteAction: (id: string) => Promise<unknown>
}) {
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<StatusFilter>('all')

  const visibleApps = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase()

    return [...apps]
      .filter((app) => {
        const matchesName = !normalizedQuery || app.name.toLocaleLowerCase().includes(normalizedQuery)
        const matchesStatus = status === 'all' || app.status === status
        return matchesName && matchesStatus
      })
      .sort((left, right) => {
        const statusDifference = statusRank(left.status) - statusRank(right.status)
        return statusDifference || left.name.localeCompare(right.name)
      })
  }, [apps, query, status])

  return (
    <section>
      <div className="mb-3 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-base font-semibold text-foreground">Deployments</h2>
          <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">{apps.length}</span>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <span className="sr-only">Search deployments by name</span>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search deployments"
              className="h-8 w-full rounded-md border border-border bg-card py-1 pl-8 pr-3 text-xs text-foreground outline-none placeholder:text-muted-foreground focus:border-muted-foreground sm:w-52"
            />
          </label>
          <label className="sr-only" htmlFor="deployment-status-filter">Filter deployments by status</label>
          <select
            id="deployment-status-filter"
            value={status}
            onChange={(event) => setStatus(event.target.value as StatusFilter)}
            className="h-8 rounded-md border border-border bg-card px-2.5 text-xs text-foreground outline-none focus:border-muted-foreground"
          >
            <option value="all">All statuses</option>
            <option value="running">Running</option>
            <option value="failed">Failed</option>
          </select>
        </div>
      </div>

      {visibleApps.length === 0 ? (
        <div className="rounded-lg border border-border bg-card px-4 py-10 text-center text-sm text-muted-foreground">
          No deployments match this filter.
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-card divide-y divide-border">
          {visibleApps.map((app) => (
            <ApplicationCardItem key={app.id} app={app} deleteAction={deleteAction} />
          ))}
        </div>
      )}
    </section>
  )
}
