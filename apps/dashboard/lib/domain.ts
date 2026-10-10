export function getAppUrl(safeName: string, path = '') {
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

  const cleanPath = path ? (path.startsWith('/') ? path : `/${path}`) : ''
  return `${protocol}//${safeName}.${baseDomain}${cleanPath}`
}
