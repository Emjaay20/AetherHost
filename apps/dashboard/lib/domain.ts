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

  let baseDomain = process.env.NEXT_PUBLIC_BASE_DOMAIN || 'localhost'
  let protocol = 'http:'

  if (typeof window !== 'undefined') {
    const host = window.location.hostname
    if (host !== 'localhost' && host !== '127.0.0.1' && !host.endsWith('.localhost')) {
      baseDomain = host.replace(/^console\./, '').replace(/^app\./, '').replace(/^dashboard\./, '')
    }
    if (window.location.protocol === 'https:') {
      protocol = 'https:'
    }
  }

  return `${protocol}//${safeName}.${baseDomain}${cleanPath}`
}
