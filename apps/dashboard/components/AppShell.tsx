'use client'

import { useEffect, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Menu, X } from 'lucide-react'
import Sidebar from './Sidebar'

export default function AppShell({
  usage,
  limit,
  activePath,
  planId,
  isAdmin = false,
  title,
  titleHref,
  crumb,
  actions,
  banner,
  children,
}: {
  usage: number
  limit: number
  activePath: string
  planId?: string
  isAdmin?: boolean
  title: string
  titleHref?: string
  crumb?: string
  actions?: ReactNode
  banner?: ReactNode
  children: ReactNode
}) {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)

  useEffect(() => {
    setOpen(false)
  }, [pathname])

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = previous
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  useEffect(() => {
    const desktop = window.matchMedia('(min-width: 1024px)')
    const closeOnDesktop = () => {
      if (desktop.matches) setOpen(false)
    }
    desktop.addEventListener('change', closeOnDesktop)
    return () => desktop.removeEventListener('change', closeOnDesktop)
  }, [])

  return (
    <div className="flex min-h-screen w-full">
      <Sidebar
        usage={usage}
        limit={limit}
        activePath={activePath}
        planId={planId}
        isAdmin={isAdmin}
        open={open}
        onClose={() => setOpen(false)}
      />
      <main className="flex min-h-screen min-w-0 flex-1 flex-col overflow-hidden">
        {banner}
        <header className="sticky top-0 z-30 flex min-h-16 flex-wrap items-center justify-between gap-3 border-b border-border/40 bg-background/80 px-4 py-3 backdrop-blur-xl sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-2">
            <button
              type="button"
              className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground lg:hidden"
              aria-label={open ? 'Close menu' : 'Open menu'}
              aria-expanded={open}
              aria-controls="app-sidebar"
              onClick={() => setOpen((value) => !value)}
            >
              {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
            {titleHref ? (
              <Link href={titleHref} className="truncate text-base font-semibold hover:text-primary sm:text-lg">
                {title}
              </Link>
            ) : (
              <h1 className="truncate text-base font-semibold sm:text-lg">{title}</h1>
            )}
            {crumb && (
              <>
                <span className="text-muted-foreground">/</span>
                <span className="truncate text-sm text-muted-foreground">{crumb}</span>
              </>
            )}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2 sm:gap-3">{actions}</div>}
        </header>
        <div className="flex-1 overflow-y-auto overflow-x-hidden p-4 sm:p-6 lg:p-8">{children}</div>
      </main>
    </div>
  )
}
