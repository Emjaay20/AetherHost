import { auth } from '@clerk/nextjs/server'

const API_URL = process.env.API_URL ?? process.env.CONTROL_PLANE_URL ?? 'http://127.0.0.1:3000'

export type AdminResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: 'signed_out' | 'forbidden' | 'not_found' | 'unreachable' | 'failed'; detail?: string }

export async function adminGet<T>(path: string): Promise<AdminResult<T>> {
  return adminRequest<T>(path)
}

export async function adminPost<T>(path: string, body?: unknown): Promise<AdminResult<T>> {
  return adminRequest<T>(path, {
    method: 'POST',
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

async function adminRequest<T>(path: string, init?: RequestInit): Promise<AdminResult<T>> {
  const { userId, getToken } = await auth()
  if (!userId) return { ok: false, error: 'signed_out' }
  const token = await getToken()
  if (!token) return { ok: false, error: 'signed_out' }

  try {
    const res = await fetch(`${API_URL}/v1/admin${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      },
      cache: 'no-store',
    })
    if (res.status === 401 || res.status === 403) return { ok: false, error: 'forbidden' }
    if (res.status === 404) return { ok: false, error: 'not_found' }
    if (!res.ok) {
      const detail = (await res.text()).slice(0, 180)
      return { ok: false, error: 'failed', detail }
    }
    return { ok: true, data: (await res.json()) as T }
  } catch {
    return { ok: false, error: 'unreachable' }
  }
}
