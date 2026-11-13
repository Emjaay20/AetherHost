'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  ArrowLeft,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  HeartHandshake,
  LayoutGrid,
  Server,
  Settings,
  Shield,
  X,
} from 'lucide-react'
import Link from 'next/link'

const SIDEBAR_STORAGE_KEY = 'aetherhost-sidebar'
const UNLIMITED_LIMIT = 999_999

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
  const [, setCollapsed] = useState(() =>
    typeof document !== 'undefined' && document.documentElement.dataset.sidebar === 'collapsed',
  )
  const isUnlimited = limit >= UNLIMITED_LIMIT
  const percentUsed = !isUnlimited && limit > 0 ? Math.min((usage / limit) * 100, 100) : 0

  const toggleDesktopSidebar = useCallback(() => {
    if (!window.matchMedia('(min-width: 1024px)').matches) return

    setCollapsed((current) => {
      const next = !current
      document.documentElement.dataset.sidebar = next ? 'collapsed' : 'expanded'
      try {
        localStorage.setItem(SIDEBAR_STORAGE_KEY, next ? 'collapsed' : 'expanded')
      } catch {
        // The layout still works when storage is unavailable.
      }
      return next
    })
  }, [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      const isEditing = target?.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target?.tagName || '')
      if (!isEditing && (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'b') {
        event.preventDefault()
        toggleDesktopSidebar()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [toggleDesktopSidebar])

  const itemClass = (path: string) =>
    `sidebar-item flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
      activePath === path
        ? 'bg-muted text-foreground'
        : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
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
        className="app-sidebar fixed inset-y-0 left-0 z-50 flex w-60 max-w-[85vw] flex-col border-r border-border bg-background transition-[width] duration-200 lg:static lg:z-auto lg:h-screen lg:max-w-none lg:translate-x-0"
      >
        <div className="sidebar-brand flex h-14 shrink-0 items-center justify-between border-b border-border px-4">
          <Link href="/console" onClick={onClose} className="flex items-center gap-2.5" title="AetherHost">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border bg-card text-foreground">
              <Server className="h-3.5 w-3.5" />
            </div>
            <span className="sidebar-label text-sm font-semibold tracking-tight text-foreground">AetherHost</span>
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

        <nav className="flex-1 space-y-1 overflow-y-auto p-2">
          <Link href="/console" onClick={onClose} className={itemClass('/console')} title="Applications">
            <LayoutGrid className="h-4 w-4 shrink-0" />
            <span className="sidebar-label">Applications</span>
          </Link>
          <Link href="/settings" onClick={onClose} className={itemClass('/settings')} title="Settings">
            <Settings className="h-4 w-4 shrink-0" />
            <span className="sidebar-label">Settings</span>
          </Link>
          <Link href="/billing" onClick={onClose} className={itemClass('/billing')} title="Billing">
            <CreditCard className="h-4 w-4 shrink-0" />
            <span className="sidebar-label">Billing</span>
          </Link>
          <Link href="/docs" onClick={onClose} className={itemClass('/docs')} title="Docs & Architecture">
            <BookOpen className="h-4 w-4 shrink-0" />
            <span className="sidebar-label">Docs & Architecture</span>
          </Link>

          {isAdmin && (
            <>
              <div className="sidebar-divider-label my-3 border-t border-border pt-3 text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
                Admin
              </div>
              <Link href="/admin" onClick={onClose} className={itemClass('/admin')} title="Control Plane">
                <Shield className="h-4 w-4 shrink-0" />
                <span className="sidebar-label">Control Plane</span>
              </Link>
              <Link href="/admin/customer-success" onClick={onClose} className={itemClass('/admin/customer-success')} title="Customer Success">
                <HeartHandshake className="h-4 w-4 shrink-0" />
                <span className="sidebar-label">Customer Success</span>
              </Link>
            </>
          )}
        </nav>

        <div className="mt-auto space-y-2 p-2">
          {activePath.startsWith('/admin') ? (
            <div className="sidebar-admin-status rounded-lg border border-border bg-card p-3.5">
              <div className="mb-2 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                  <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">System Live</span>
                </div>
                <span className="rounded-md border border-border bg-muted px-1.5 py-0.5 text-xs font-mono font-medium text-foreground">OPERATOR</span>
              </div>
              <p className="text-xs leading-normal text-muted-foreground">Control plane active. Multi-tenant fleet telemetry.</p>
              <Link href="/console" onClick={onClose} className="mt-2.5 flex items-center gap-1.5 text-xs font-medium text-foreground transition-colors hover:text-primary">
                <ArrowLeft className="h-3 w-3" /> Back to Console
              </Link>
            </div>
          ) : (
            <div className="sidebar-usage rounded-lg border border-border bg-card p-3.5">
              <div className="mb-2 flex items-center justify-between">
                <h4 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Plan Usage</h4>
                <span className="rounded-md border border-border bg-muted px-1.5 py-0.5 text-xs font-mono font-medium text-foreground">
                  {planId ? planId.toUpperCase() : 'STARTER'}
                </span>
              </div>
              {isUnlimited ? (
                <p className="text-xs text-muted-foreground"><span className="font-semibold tabular-nums text-foreground">{usage}</span> apps · Unlimited</p>
              ) : (
                <>
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
                </>
              )}
            </div>
          )}
          <button
            type="button"
            onClick={toggleDesktopSidebar}
            className="hidden w-full items-center justify-center rounded-md border border-border p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground lg:flex"
            title="Toggle sidebar (Ctrl/Cmd+B)"
            aria-label="Toggle sidebar"
          >
            <ChevronLeft className="sidebar-toggle-expanded h-4 w-4" />
            <ChevronRight className="sidebar-toggle-collapsed h-4 w-4" />
          </button>
        </div>
      </aside>
    </>
  )
}
