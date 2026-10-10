import type { ReactNode } from 'react'
import Sidebar from '../../components/Sidebar'
import { UserButton, Show, SignInButton } from '@clerk/nextjs'
import Link from 'next/link'

export default function AdminShell({
  usage,
  limit,
  crumb,
  children,
}: {
  usage: number
  limit: number
  crumb: string
  children: ReactNode
}) {
  return (
    <div className="min-h-screen flex w-full">
      <Sidebar usage={usage} limit={Math.max(limit, 1)} activePath="/admin" />
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="h-16 flex items-center justify-between px-8 border-b border-border/40 bg-background/50 backdrop-blur-xl sticky top-0 z-10">
          <div className="flex items-center gap-2 min-w-0">
            <Link href="/admin" className="text-lg font-semibold hover:text-primary transition-colors">
              Control plane
            </Link>
            <span className="text-muted-foreground">/</span>
            <span className="text-muted-foreground truncate">{crumb}</span>
          </div>
          <div className="flex items-center gap-4">
            <Show when="signed-in">
              <UserButton />
            </Show>
            <Show when="signed-out">
              <SignInButton mode="modal">
                <button className="px-4 py-2 rounded-lg text-sm font-medium bg-primary text-primary-foreground">
                  Sign In
                </button>
              </SignInButton>
            </Show>
          </div>
        </header>
        <div className="flex-1 overflow-y-auto p-8">
          <div className="max-w-7xl mx-auto space-y-8 animate-in fade-in duration-500">
            {children}
          </div>
        </div>
      </main>
    </div>
  )
}
