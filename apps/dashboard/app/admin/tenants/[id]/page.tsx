import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { getEntitlements } from '../../../actions'
import AdminShell from '../../AdminShell'
import TenantDetailView from '../../TenantDetail'
import { adminGet } from '../../admin-api'
import type { TenantDetail } from '../../types'

export const dynamic = 'force-dynamic'

export default async function TenantAdminPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const entitlements = await getEntitlements()
  const result = await adminGet<TenantDetail>(`/tenants/${encodeURIComponent(id)}`)
  if (!result.ok && result.error === 'signed_out') redirect('/sign-in')
  if (!result.ok && result.error === 'forbidden') {
    return (
      <AdminShell usage={0} limit={1} crumb="denied">
        <h1 className="text-2xl font-semibold">Access denied</h1>
      </AdminShell>
    )
  }
  if (!result.ok && result.error === 'not_found') notFound()
  if (!result.ok) {
    return (
      <AdminShell usage={0} limit={1} crumb="unreachable">
        <h1 className="text-2xl font-semibold">Control plane unreachable</h1>
      </AdminShell>
    )
  }

  return (
    <AdminShell
      usage={entitlements?.usage?.applications || 0}
      limit={entitlements?.limits?.applications || 1}
      crumb={result.data.tenant.name}
    >
      <Link href="/admin" className="text-xs text-muted-foreground hover:text-foreground">← Directory</Link>
      <TenantDetailView detail={result.data} />
    </AdminShell>
  )
}
