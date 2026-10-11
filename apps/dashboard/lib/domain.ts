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
  const isDemoEnv = process.env.NEXT_PUBLIC_DEMO_MODE === 'true'

  if (typeof window !== 'undefined') {
    const host = window.location.hostname
    if (isDemoEnv || host.endsWith('.onrender.com')) {
      return `${window.location.origin}/preview/${safeName}${cleanPath}`
    }
  } else if (isDemoEnv) {
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
