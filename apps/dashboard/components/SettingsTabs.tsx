'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Shield, Key, CreditCard, Building2, Bell, ExternalLink, Zap } from 'lucide-react'
import { useUser } from '@clerk/nextjs'
import ApiKeyManager from './ApiKeyManager'

export default function SettingsTabs({ planId = 'starter' }: { planId?: string }) {
  const [activeTab, setActiveTab] = useState('general')
  const { user } = useUser()

  const tabs = [
    { id: 'general', label: 'General', icon: Building2 },
    { id: 'keys', label: 'API Keys', icon: Key },
    { id: 'billing', label: 'Billing', icon: CreditCard },
    { id: 'security', label: 'Security', icon: Shield },
    { id: 'notifications', label: 'Notifications', icon: Bell },
  ]

  const userDisplayName = user?.fullName || user?.username || 'My Organization'
  const userEmail = user?.primaryEmailAddress?.emailAddress || ''

  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
      {/* Settings Nav */}
      <nav className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1 md:mx-0 md:flex-col md:overflow-visible md:px-0 md:pb-0">
        {tabs.map(tab => {
          const Icon = tab.icon
          const isActive = activeTab === tab.id
          
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex w-auto shrink-0 items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors md:w-full ${
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
                  <label className="block text-sm font-medium text-muted-foreground mb-1">Organization / Developer Name</label>
                  <input 
                    type="text" 
                    value={userDisplayName} 
                    readOnly
                    className="w-full max-w-md bg-muted/40 border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none"
                  />
                  <p className="text-xs text-muted-foreground mt-1">Managed automatically via your Clerk account profile.</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1">Primary Email</label>
                  <input 
                    type="email" 
                    value={userEmail} 
                    readOnly
                    className="w-full max-w-md bg-muted/40 border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none"
                  />
                </div>
              </div>
            </section>
          </div>
        )}

        {activeTab === 'billing' && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
            {/* Plan Details */}
            <section className="p-6 rounded-2xl border border-border/50 bg-card shadow-sm relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full blur-3xl -mr-10 -mt-10" />
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="font-semibold text-lg text-foreground">Active Subscription</h3>
                  <p className="text-sm text-muted-foreground">
                    You are currently on the <strong className="text-foreground uppercase">{planId}</strong> plan.
                  </p>
                </div>
                <div className="px-3 py-1 bg-primary/10 text-primary text-xs font-bold rounded-full uppercase tracking-wider">
                  {planId}
                </div>
              </div>
              
              <div className="bg-muted/30 border border-border/50 rounded-xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h4 className="font-medium text-foreground flex items-center gap-2">
                    <Zap className="w-4 h-4 text-primary" />
                    {planId === 'max' ? 'Max Plan' : planId === 'pro' ? 'Pro Plan' : 'Starter Plan (Free)'}
                  </h4>
                  <p className="text-sm text-muted-foreground mt-1">
                    {planId === 'max'
                      ? '20 Applications • 200 AI Requests • 10 GB Storage • Custom Domains & Priority Support'
                      : planId === 'pro'
                        ? '5 Applications • 50 AI Requests • 2 GB Storage • Custom Domains'
                        : '1 Application • 10 AI Requests • 512 MB Storage'}
                  </p>
                </div>
                <Link
                  href="/billing"
                  className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground font-medium text-sm hover:bg-primary/90 transition-colors shrink-0"
                >
                  Manage Plans & Invoices <ExternalLink className="w-4 h-4" />
                </Link>
              </div>
            </section>
          </div>
        )}

        {activeTab === 'keys' && (
          <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
            <ApiKeyManager />
          </div>
        )}

        {(activeTab === 'security' || activeTab === 'notifications') && (
          <div className="p-12 text-center border border-border/50 border-dashed rounded-2xl bg-card/30 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <h3 className="text-lg font-medium text-foreground mb-1">Coming Soon</h3>
            <p className="text-sm text-muted-foreground">This settings pane is currently under development.</p>
          </div>
        )}
      </div>
    </div>
  )
}
