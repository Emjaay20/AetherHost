import Sidebar from '../../components/Sidebar'
import SettingsTabs from '../../components/SettingsTabs'
import { getEntitlements } from '../actions'
import { UserButton } from "@clerk/nextjs"
import { Shield, Key, CreditCard, Building2, Bell } from 'lucide-react'

export default async function SettingsPage() {
  const entitlements = await getEntitlements()
  const usage = entitlements?.usage?.applications || 0
  const limit = entitlements?.limits?.applications || 3

  return (
    <div className="min-h-screen flex w-full">
      <Sidebar usage={usage} limit={limit} activePath="/settings" />

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden bg-background">
        <header className="h-16 flex items-center justify-between px-8 border-b border-border/40 bg-background/50 backdrop-blur-xl sticky top-0 z-10">
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-semibold">Settings</h1>
            <span className="text-muted-foreground">/</span>
            <span className="text-muted-foreground">workspace</span>
          </div>
          <div className="flex items-center gap-4">
            <UserButton />
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-8">
          <div className="max-w-4xl mx-auto space-y-8">
            
            {/* Header */}
            <div>
              <h2 className="text-2xl font-bold tracking-tight">Organization Settings</h2>
              <p className="text-muted-foreground mt-1">Manage your team, billing, and API preferences.</p>
            </div>

            <SettingsTabs />
          </div>
        </div>
      </main>
    </div>
  )
}
