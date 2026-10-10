'use server'

import { revalidatePath } from 'next/cache'
import { adminPost } from './admin-api'

export async function syncDirectory() {
  const result = await adminPost<{
    scanned: number
    upserted: number
    failed: number
    truncated: boolean
  }>('/directory/sync')
  if (!result.ok) {
    return { error: result.error === 'unreachable' ? 'Control plane unreachable' : 'Reconcile failed' }
  }
  revalidatePath('/admin')
  return result.data
}

export async function applyOperatorPlan(
  tenantId: string,
  planId: string,
  idempotencyKey: string,
) {
  const result = await adminPost<{ message: string; planId: string; reconciled: boolean }>(
    `/tenants/${encodeURIComponent(tenantId)}/plan`,
    { planId, idempotencyKey },
  )
  if (!result.ok) {
    return { error: result.detail || 'Plan apply failed' }
  }
  revalidatePath('/admin')
  revalidatePath(`/admin/tenants/${tenantId}`)
  return result.data
}

export async function impersonateTenant(tenantId: string, tenantName: string) {
  const result = await adminPost<{
    success: boolean
    tenantId: string
    tenantName: string
    token: string
    url?: string
  }>(`/tenants/${encodeURIComponent(tenantId)}/impersonate`)

  if (!result.ok) {
    return { error: result.detail || 'Failed to impersonate tenant' }
  }

  const { cookies } = await import('next/headers')
  const cookieStore = await cookies()
  cookieStore.set('aether_impersonate_tenant', tenantId, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 3600, // 1 hour
  })
  cookieStore.set('aether_impersonate_tenant_name', tenantName, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 3600,
  })

  revalidatePath('/console')
  return { success: true, url: result.data.url }
}

export async function stopImpersonating() {
  const { cookies } = await import('next/headers')
  const { redirect } = await import('next/navigation')
  const cookieStore = await cookies()
  cookieStore.delete('aether_impersonate_tenant')
  cookieStore.delete('aether_impersonate_tenant_name')
  revalidatePath('/console')
  redirect('/admin')
}

export async function replayTenantWebhooks(tenantId: string) {
  const result = await adminPost<{
    success: boolean
    count: number
    message: string
  }>(`/tenants/${encodeURIComponent(tenantId)}/replay-webhooks`)

  if (!result.ok) {
    return { error: result.detail || 'Failed to replay webhooks' }
  }

  revalidatePath('/admin')
  revalidatePath(`/admin/tenants/${tenantId}`)
  return result.data
}

export async function refundTenant(
  tenantId: string,
  amountDollars?: number,
  reason?: string,
) {
  const result = await adminPost<{
    success: boolean
    invoiceId: string
    refundedAmountDollars: number
    message: string
  }>(`/tenants/${encodeURIComponent(tenantId)}/refund`, {
    amountDollars,
    reason,
  })

  if (!result.ok) {
    return { error: result.detail || 'Failed to issue refund' }
  }

  revalidatePath('/admin')
  revalidatePath(`/admin/tenants/${tenantId}`)
  return result.data
}

export async function suspendTenant(tenantId: string, reason?: string) {
  const result = await adminPost<{
    success: boolean
    message: string
  }>(`/tenants/${encodeURIComponent(tenantId)}/suspend`, { reason })

  if (!result.ok) {
    return { error: result.detail || 'Failed to suspend tenant' }
  }

  revalidatePath('/admin')
  revalidatePath(`/admin/tenants/${tenantId}`)
  return result.data
}

export async function unsuspendTenant(tenantId: string) {
  const result = await adminPost<{
    success: boolean
    message: string
  }>(`/tenants/${encodeURIComponent(tenantId)}/unsuspend`)

  if (!result.ok) {
    return { error: result.detail || 'Failed to reactivate tenant' }
  }

  revalidatePath('/admin')
  revalidatePath(`/admin/tenants/${tenantId}`)
  return result.data
}

