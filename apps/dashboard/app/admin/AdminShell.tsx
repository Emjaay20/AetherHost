import type { ReactNode } from 'react'
import AppShell from '../../components/AppShell'
import { UserButton, Show, SignInButton } from '@clerk/nextjs'

export default function AdminShell({
  usage,
  limit,
  crumb,
  planId,
  children,
}: {
  usage: number
  limit: number
  crumb: string
  planId?: string
  children: ReactNode
}) {
  return (
    <AppShell
      usage={usage}
      limit={Math.max(limit, 1)}
      activePath="/admin"
      planId={planId}
      isAdmin
      title="Control plane"
      titleHref="/admin"
      crumb={crumb}
      actions={
        <>
          <Show when="signed-in">
            <UserButton />
          </Show>
          <Show when="signed-out">
            <SignInButton mode="modal">
              <button className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
                Sign In
              </button>
            </SignInButton>
          </Show>
        </>
      }
    >
      <div className="mx-auto max-w-7xl space-y-8 animate-in fade-in duration-500">{children}</div>
    </AppShell>
  )
}
