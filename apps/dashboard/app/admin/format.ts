export function money(dollars: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(dollars)
}

export function pct(ratio: number) {
  return `${Math.round(ratio * 100)}%`
}

export function age(seconds: number) {
  if (seconds < 60) return `${seconds}s`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`
  return `${Math.floor(seconds / 86400)}d`
}

export function when(iso: string) {
  return new Date(iso).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function clock(iso: string) {
  return new Date(iso).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

export function statusClass(status: string) {
  switch (status) {
    case 'running':
    case 'active':
    case 'paid':
    case 'succeeded':
      return 'bg-green-500/10 text-green-400 border-green-500/20'
    case 'pending':
    case 'past_due':
    case 'trialing':
      return 'bg-amber-500/10 text-amber-400 border-amber-500/20'
    case 'failed':
    case 'payment_failed':
      return 'bg-red-500/10 text-red-400 border-red-500/20'
    case 'suspended':
      return 'bg-orange-500/10 text-orange-400 border-orange-500/20'
    default:
      return 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20'
  }
}

export function planClass(planId: string) {
  if (planId === 'max') return 'bg-purple-500/10 text-purple-400 border-purple-500/20'
  if (planId === 'pro') return 'bg-blue-500/10 text-blue-400 border-blue-500/20'
  return 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20'
}

export function barTone(ratio: number) {
  if (ratio >= 0.9) return 'bg-red-500'
  if (ratio >= 0.7) return 'bg-amber-500'
  return 'bg-blue-500'
}

export function pageHref(q: string, skip: number) {
  const params = new URLSearchParams()
  if (q) params.set('q', q)
  if (skip > 0) params.set('skip', String(skip))
  const query = params.toString()
  return query ? `/admin?${query}` : '/admin'
}
