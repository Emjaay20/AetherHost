export function safeAppName(name: string) {
  let s = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  if (s.length > 40) {
    s = s.slice(0, 40).replace(/-+$/g, '')
  }
  return s || 'app'
}
