'use client'

import { CreditCard, LayoutGrid, Settings, Server, Shield, X, BookOpen, Activity, ArrowLeft, HeartHandshake } from 'lucide-react'
import Link from 'next/link'

export default function Sidebar({
  usage,
  limit,
  activePath,
  planId,
  isAdmin = false,
  open = false,
  onClose,
}: {
  usage: number
  limit: number
  activePath: string
  planId?: string
  isAdmin?: boolean
  open?: boolean
  onClose?: () => void
}) {
  const percentUsed = limit > 0 ? Math.min((usage / limit) * 100, 100) : 0

  const itemClass = (path: string) =>
    `flex items-center gap-3 px-3 py-2 rounded-md font-medium text-sm transition-colors ${
      activePath === path
        ? 'bg-muted text-foreground'
        : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
    }`

  return (
    <>
      <button
        type="button"
        aria-label="Close menu"
        className={`fixed inset-0 z-40 bg-black/60 lg:hidden ${open ? 'block' : 'hidden'}`}
        onClick={onClose}
      />
      <aside
        id="app-sidebar"
        data-open={open ? 'true' : 'false'}
        className="app-sidebar fixed inset-y-0 left-0 z-50 flex w-64 max-w-[85vw] flex-col border-r border-border bg-background lg:static lg:z-auto lg:h-screen lg:max-w-none lg:translate-x-0"
      >
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-border px-5">
          <Link href="/console" onClick={onClose} className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-md border border-border bg-card text-foreground">
              <Server className="h-3.5 w-3.5" />
            </div>
            <span className="font-semibold text-sm tracking-tight text-foreground">AetherHost</span>
          </Link>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground lg:hidden"
            aria-label="Close sidebar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto p-3">
          <Link href="/console" onClick={onClose} className={itemClass('/console')}>
            <LayoutGrid className="h-4 w-4" /> Applications
          </Link>
          <Link href="/settings" onClick={onClose} className={itemClass('/settings')}>
            <Settings className="h-4 w-4" /> Settings
          </Link>
          <Link href="/billing" onClick={onClose} className={itemClass('/billing')}>
            <CreditCard className="h-4 w-4" /> Billing
          </Link>
          <Link href="/docs" onClick={onClose} className={itemClass('/docs')}>
            <BookOpen className="h-4 w-4" /> Docs & Architecture
          </Link>
          {isAdmin && (
            <>
              <Link href="/admin" onClick={onClose} className={itemClass('/admin')}>
                <Shield className="h-4 w-4" /> Control Plane
              </Link>
              <Link href="/admin/customer-success" onClick={onClose} className={itemClass('/admin/customer-success')}>
                <HeartHandshake className="h-4 w-4" /> Customer Success
              </Link>
            </>
          )}
        </nav>
        <div className="mt-auto p-3 space-y-2">
          {activePath.startsWith('/admin') ? (
            <div className="rounded-lg border border-border bg-card p-3.5">
              <div className="mb-2 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="inline-flex h-2 w-2 rounded-full bg-emerald-500"></span>
                  <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">System Live</span>
                </div>
                <span className="rounded-md border border-border bg-muted px-1.5 py-0.5 text-xs font-mono font-medium text-foreground">
                  OPERATOR
                </span>
              </div>
              <p className="text-xs text-muted-foreground leading-normal">
                Control plane active. Multi-tenant fleet telemetry.
              </p>
              <Link
                href="/console"
                onClick={onClose}
                className="mt-2.5 flex items-center gap-1.5 text-xs font-medium text-foreground hover:text-primary transition-colors"
              >
                <ArrowLeft className="h-3 w-3" /> Back to Console
              </Link>
            </div>
          ) : (
            <div className="rounded-lg border border-border bg-card p-3.5">
              <div className="mb-2 flex items-center justify-between">
                <h4 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Plan Usage</h4>
                <span className="rounded-md border border-border bg-muted px-1.5 py-0.5 text-xs font-mono font-medium text-foreground">
                  {planId ? planId.toUpperCase() : 'STARTER'}
                </span>
              </div>
              <div className="mb-2 flex items-baseline gap-1">
                <span className="text-xl font-semibold tabular-nums text-foreground">{usage}</span>
                <span className="text-xs text-muted-foreground">/ {limit} apps</span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${percentUsed >= 90 ? 'bg-red-500' : percentUsed >= 80 ? 'bg-amber-500' : 'bg-foreground/40'}`}
                  style={{ width: `${percentUsed}%` }}
                />
              </div>
            </div>
          )}
        </div>
      </aside>
    </>
  )
}
