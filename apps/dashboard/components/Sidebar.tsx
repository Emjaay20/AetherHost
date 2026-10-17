'use client'

import { CreditCard, LayoutGrid, Settings, Server, Shield, X, BookOpen, Activity, ArrowLeft } from 'lucide-react'
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
    `flex items-center gap-3 px-3 py-2.5 rounded-lg font-medium text-sm transition-colors ${
      activePath === path
        ? 'bg-primary/10 text-primary border border-primary/20'
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
        className="app-sidebar fixed inset-y-0 left-0 z-50 flex w-64 max-w-[85vw] flex-col border-r border-border/40 bg-background/95 backdrop-blur-xl lg:static lg:z-auto lg:h-screen lg:max-w-none lg:translate-x-0 lg:bg-background/50"
      >
        <div className="flex h-16 shrink-0 items-center justify-between border-b border-border/40 px-6">
          <Link href="/console" onClick={onClose} className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-tr from-primary to-blue-400 shadow-[0_0_15px_rgba(59,130,246,0.3)]">
              <Server className="h-4 w-4 text-white" />
            </div>
            <span className="font-bold tracking-wide">AetherHost</span>
          </Link>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground lg:hidden"
            aria-label="Close sidebar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <nav className="flex-1 space-y-1.5 overflow-y-auto p-4">
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
            <Link href="/admin" onClick={onClose} className={itemClass('/admin')}>
              <Shield className="h-4 w-4" /> Admin Console
            </Link>
          )}
        </nav>
        <div className="mt-auto p-4 space-y-2">
          {activePath.startsWith('/admin') ? (
            <div className="relative overflow-hidden rounded-xl border border-primary/20 bg-primary/5 p-4 shadow-inner">
              <div className="mb-2 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500"></span>
                  </span>
                  <span className="text-xs font-semibold uppercase tracking-wider text-emerald-400">System Live</span>
                </div>
                <span className="rounded-full border border-primary/30 bg-primary/20 px-2 py-0.5 text-[10px] font-mono font-semibold text-primary">
                  OPERATOR
                </span>
              </div>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                Control plane active. Multi-tenant fleet telemetry.
              </p>
              <Link
                href="/console"
                onClick={onClose}
                className="mt-3 flex items-center gap-1.5 text-xs font-medium text-primary hover:text-primary/80 transition-colors"
              >
                <ArrowLeft className="h-3 w-3" /> Back to Console
              </Link>
            </div>
          ) : (
            <div className="relative overflow-hidden rounded-xl border border-border/50 bg-card p-4 shadow-inner">
              <div className="mb-3 flex items-center justify-between">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Plan Usage</h4>
                <span className="rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                  {planId ? planId.toUpperCase() : 'Starter'}
                </span>
              </div>
              <div className="mb-2 flex items-end gap-1">
                <span className="text-2xl font-bold">{usage}</span>
                <span className="mb-1 text-sm text-muted-foreground">/ {limit} apps</span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary transition-all duration-500 ease-out"
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
