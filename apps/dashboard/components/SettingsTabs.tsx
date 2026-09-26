'use client'

import { useState } from 'react'
import { Shield, Key, CreditCard, Building2, Bell } from 'lucide-react'

export default function SettingsTabs() {
  const [activeTab, setActiveTab] = useState('general')

  const tabs = [
    { id: 'general', label: 'General', icon: Building2 },
    { id: 'security', label: 'Security', icon: Shield },
    { id: 'keys', label: 'API Keys', icon: Key },
    { id: 'billing', label: 'Billing', icon: CreditCard },
    { id: 'notifications', label: 'Notifications', icon: Bell },
  ]

  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
      {/* Settings Nav */}
      <nav className="space-y-1">
        {tabs.map(tab => {
          const Icon = tab.icon
          const isActive = activeTab === tab.id
          
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg font-medium text-sm transition-colors ${
                isActive 
                  ? 'bg-muted text-foreground' 
                  : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
              }`}
            >
              <Icon className="w-4 h-4" /> {tab.label}
            </button>
          )
        })}
      </nav>

      {/* Settings Content */}
      <div className="col-span-3 space-y-6">
        
        {activeTab === 'general' && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
            {/* Organization Details */}
            <section className="p-6 rounded-2xl border border-border/50 bg-card shadow-sm">
              <h3 className="font-semibold text-lg mb-4">Organization Profile</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1">Organization Name</label>
                  <input 
                    type="text" 
                    defaultValue="demo-agency" 
                    className="w-full max-w-md bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1">Support Email</label>
                  <input 
                    type="email" 
                    defaultValue="admin@demo-agency.com" 
                    className="w-full max-w-md bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                </div>
                <button className="px-4 py-2 rounded-lg bg-primary text-primary-foreground font-medium text-sm hover:bg-primary/90 transition-colors">
                  Save Changes
                </button>
              </div>
            </section>

            {/* Danger Zone */}
            <section className="p-6 rounded-2xl border border-red-500/20 bg-card shadow-sm mt-8">
              <h3 className="font-semibold text-lg text-red-500 mb-1">Danger Zone</h3>
              <p className="text-sm text-muted-foreground mb-4">Irreversible and destructive actions.</p>
              
              <div className="flex items-center justify-between py-4 border-t border-border/50">
                <div>
                  <h4 className="font-medium text-foreground">Delete Organization</h4>
                  <p className="text-sm text-muted-foreground">Permanently delete this organization and all applications.</p>
                </div>
                <button className="px-4 py-2 rounded-lg border border-red-500/50 text-red-500 font-medium text-sm hover:bg-red-500/10 transition-colors">
                  Delete Organization
                </button>
              </div>
            </section>
          </div>
        )}

        {activeTab === 'billing' && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
            {/* Plan Details */}
            <section className="p-6 rounded-2xl border border-border/50 bg-card shadow-sm relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full blur-3xl -mr-10 -mt-10" />
              <h3 className="font-semibold text-lg mb-1">Current Plan</h3>
              <p className="text-sm text-muted-foreground mb-4">You are currently on the Starter plan.</p>
              
              <div className="bg-muted/30 border border-border/50 rounded-xl p-4 flex items-center justify-between">
                <div>
                  <h4 className="font-medium text-foreground">Starter Tier</h4>
                  <p className="text-sm text-muted-foreground mt-1">Up to 3 applications, 1000 AI requests.</p>
                </div>
                <button className="px-4 py-2 rounded-lg bg-white text-black font-medium text-sm hover:bg-gray-100 transition-colors">
                  Upgrade to Pro
                </button>
              </div>
            </section>
          </div>
        )}

        {(activeTab === 'security' || activeTab === 'keys' || activeTab === 'notifications') && (
          <div className="p-12 text-center border border-border/50 border-dashed rounded-2xl bg-card/30 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <h3 className="text-lg font-medium text-foreground mb-1">Coming Soon</h3>
            <p className="text-sm text-muted-foreground">This settings pane is currently under development.</p>
          </div>
        )}
      </div>
    </div>
  )
}
