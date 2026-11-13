export function resolveApiUrl(): string {
  const raw =
    process.env.API_URL ||
    (process.env.API_HOSTPORT ? `http://${process.env.API_HOSTPORT}` : '') ||
    process.env.CONTROL_PLANE_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    'http://127.0.0.1:3000'

  if (!raw.startsWith('http://') && !raw.startsWith('https://')) {
    return `http://${raw}`
  }
  return raw.replace(/\/$/, '')
}

export function getAppUrl(safeName: string, path = '') {
  const cleanPath = path ? (path.startsWith('/') ? path : `/${path}`) : ''
  const useTraefik = process.env.NEXT_PUBLIC_USE_TRAEFIK === 'true'

  if (!useTraefik) {
    if (typeof window !== 'undefined') {
      return `${window.location.origin}/preview/${safeName}${cleanPath}`
    }
    return `/preview/${safeName}${cleanPath}`
  }

  let baseDomain = process.env.NEXT_PUBLIC_BASE_DOMAIN || 'aetherhost.app'
  let protocol = 'https:'

  if (typeof window !== 'undefined') {
    const host = window.location.hostname
    if (host === 'localhost' || host === '127.0.0.1' || host.endsWith('.localhost')) {
      baseDomain = host
      protocol = window.location.protocol
    } else {
      baseDomain = 'aetherhost.app'
      protocol = 'https:'
    }
  }

  return `${protocol}//${safeName}.${baseDomain}${cleanPath}`
}

export function getLegacyAppUrl(safeName: string, path = '') {
  const cleanPath = path ? (path.startsWith('/') ? path : `/${path}`) : ''
  return `https://${safeName}.aetherhost.com.ng${cleanPath}`
}

export const LEGACY_MIGRATION_CUTOFF = '2026-11-13T21:00:00.000Z'

export function isLegacyApplication(createdAt?: string | Date | null): boolean {
  if (!createdAt) return false
  const date = new Date(createdAt)
  if (isNaN(date.getTime())) return false
  return date.getTime() <= new Date(LEGACY_MIGRATION_CUTOFF).getTime()
}
