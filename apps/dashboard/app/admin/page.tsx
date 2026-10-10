import { redirect } from 'next/navigation'
import AutoRefresh from '../../components/AutoRefresh'
import { getEntitlements } from '../actions'
import AdminShell from './AdminShell'
import OverviewBoard from './Overview'
import { adminGet } from './admin-api'
import type { Overview, TenantPage } from './types'

export const dynamic = 'force-dynamic'

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; skip?: string }>
}) {
  const sp = await searchParams
  const q = sp.q?.trim().slice(0, 80) ?? ''
  const skip = Math.max(0, Number(sp.skip) || 0)
  const entitlements = await getEntitlements()
  const [overview, directory] = await Promise.all([
    adminGet<Overview>('/overview'),
    adminGet<TenantPage>(`/tenants?skip=${skip}&take=20${q ? `&q=${encodeURIComponent(q)}` : ''}`),
  ])

  if (!overview.ok && overview.error === 'signed_out') redirect('/sign-in')
  if (!overview.ok && overview.error === 'forbidden') {
    return (
      <AdminShell usage={0} limit={1} crumb="denied">
        <h1 className="text-2xl font-semibold">Access denied</h1>
        <p className="text-sm text-muted-foreground">This Clerk user is not in ADMIN_TENANT_IDS.</p>
      </AdminShell>
    )
  }
  if (!overview.ok || !directory.ok || !isOverview(overview.data) || !isDirectory(directory.data)) {
    return (
      <AdminShell usage={entitlements?.usage?.applications || 0} limit={entitlements?.limits?.applications || 1} crumb="unreachable">
        <h1 className="text-2xl font-semibold">Control plane unreachable</h1>
        <p className="text-sm text-muted-foreground">The admin API did not return a readable snapshot.</p>
      </AdminShell>
    )
  }

  return (
    <AdminShell
      usage={entitlements?.usage?.applications || 0}
      limit={entitlements?.limits?.applications || 1}
      crumb="operator"
    >
      <AutoRefresh interval={8000} />
      <OverviewBoard overview={overview.data} directory={directory.data} q={q} />
    </AdminShell>
  )
}

function isOverview(value: Overview): value is Overview {
  return Boolean(value && value.fleet && value.billing && value.analytics)
}

function isDirectory(value: TenantPage): value is TenantPage {
  return Boolean(value && Array.isArray(value.data) && value.meta)
}
