'use server'

import { auth } from '@clerk/nextjs/server'
import { revalidatePath } from 'next/cache'
import { resolveApiUrl } from '../../lib/domain'
import { adminPost } from './admin-api'

const API_URL = resolveApiUrl()

async function csRequest<T>(path: string, init?: RequestInit) {
  const { userId, getToken } = await auth()
  if (!userId) return { ok: false as const, error: 'Operator session signed out' }
  const token = await getToken()
  if (!token) return { ok: false as const, error: 'Missing authentication token' }

  try {
    const res = await fetch(`${API_URL}/v1/customer-success${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      },
      cache: 'no-store',
    })
    if (res.status === 401 || res.status === 403) {
      return { ok: false as const, error: 'Operator authorization required (401/403)' }
    }
    if (!res.ok) {
      const detail = (await res.text()).slice(0, 180)
      return { ok: false as const, error: detail || `Request failed with status ${res.status}` }
    }
    return { ok: true as const, data: (await res.json()) as T }
  } catch {
    return { ok: false as const, error: 'Customer Success API unreachable' }
  }
}

export async function getCustomerSuccessPortfolio<T>() {
  return csRequest<T>('/portfolio')
}

export async function syncCustomerSuccessSalesforce(accountId: string) {
  return csRequest<{ success?: boolean; message?: string }>(
    `/accounts/${encodeURIComponent(accountId)}/sync-sfdc`,
    { method: 'POST' },
  )
}

export async function flagCustomerSuccessExpansion(
  accountId: string,
  potentialARR = 18000,
) {
  return csRequest<{ success?: boolean; message?: string }>(
    `/accounts/${encodeURIComponent(accountId)}/flag-expansion`,
    {
      method: 'POST',
      body: JSON.stringify({ potentialARR }),
    },
  )
}

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

