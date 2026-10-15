import AppShell from '../../components/AppShell'
import SettingsTabs from '../../components/SettingsTabs'
import { getEntitlements } from '../actions'
import { UserButton } from "@clerk/nextjs"
import { isCurrentUserAdmin } from '../../lib/admin'

export default async function SettingsPage() {
  const [entitlements, isAdmin] = await Promise.all([
    getEntitlements(),
    isCurrentUserAdmin(),
  ])
  const usage = entitlements?.usage?.applications || 0
  const limit = entitlements?.limits?.applications || 3

  return (
    <AppShell
      usage={usage}
      limit={limit}
      activePath="/settings"
      planId={entitlements?.planId || 'starter'}
      isAdmin={isAdmin}
      title="Settings"
      crumb="workspace"
      actions={<UserButton />}
    >
      <div className="mx-auto max-w-4xl space-y-8">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Organization Settings</h2>
          <p className="mt-1 text-muted-foreground">Manage your team, billing, and API preferences.</p>
        </div>
        <SettingsTabs planId={entitlements?.planId || 'starter'} />
      </div>
    </AppShell>
  )
}
