'use client'

import { Shield, Users, Server, Zap, Database, Activity, Search } from 'lucide-react'
import { useState } from 'react'
import Link from 'next/link'
import { upgradeTenantPlan } from './actions'
import { useRouter } from 'next/navigation'

export default function AdminDashboard({ tenants }: { tenants: any[] }) {
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  const filtered = tenants.filter(t => 
    t.name.toLowerCase().includes(search.toLowerCase()) || 
    t.id.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-8 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-purple-500/10 flex items-center justify-center text-purple-500 border border-purple-500/20">
            <Shield className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Admin Console</h1>
            <p className="text-muted-foreground mt-1">Platform overview and user management</p>
          </div>
        </div>
        <Link href="/" className="text-sm font-medium text-muted-foreground hover:text-foreground hover:underline">
          &larr; Back to Dashboard
        </Link>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <div className="p-5 rounded-2xl bg-card border border-border/50 shadow-sm">
          <div className="flex items-center gap-3 text-muted-foreground mb-3">
            <Users className="w-5 h-5" />
            <h3 className="font-medium text-sm">Total Tenants</h3>
          </div>
          <p className="text-3xl font-bold">{tenants.length}</p>
        </div>
        <div className="p-5 rounded-2xl bg-card border border-border/50 shadow-sm">
          <div className="flex items-center gap-3 text-muted-foreground mb-3">
            <Server className="w-5 h-5" />
            <h3 className="font-medium text-sm">Active Apps</h3>
          </div>
          <p className="text-3xl font-bold">
            {tenants.reduce((acc, t) => acc + (t._count?.applications || 0), 0)}
          </p>
        </div>
        <div className="p-5 rounded-2xl bg-card border border-border/50 shadow-sm">
          <div className="flex items-center gap-3 text-muted-foreground mb-3">
            <Zap className="w-5 h-5" />
            <h3 className="font-medium text-sm">AI Tokens Used</h3>
          </div>
          <p className="text-3xl font-bold">
            {tenants.reduce((acc, t) => acc + (t.entitlements?.totalAiTokens || 0), 0).toLocaleString()}
          </p>
        </div>
        <div className="p-5 rounded-2xl bg-card border border-border/50 shadow-sm">
          <div className="flex items-center gap-3 text-muted-foreground mb-3">
            <Database className="w-5 h-5" />
            <h3 className="font-medium text-sm">Platform Memory</h3>
          </div>
          <p className="text-3xl font-bold">
            {tenants.reduce((acc, t) => acc + (t.entitlements?.currentMemoryMb || 0), 0).toFixed(1)} <span className="text-lg text-muted-foreground font-medium">MB</span>
          </p>
        </div>
      </div>

      <div className="bg-card rounded-2xl border border-border/50 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-border/50 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Tenant Directory</h2>
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input 
              type="text"
              placeholder="Search tenants..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9 pr-4 py-2 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/50 w-64"
            />
          </div>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-border/50 text-sm text-muted-foreground">
                <th className="p-4 font-medium">Tenant</th>
                <th className="p-4 font-medium">Plan</th>
                <th className="p-4 font-medium">Apps (Used/Limit)</th>
                <th className="p-4 font-medium">AI Requests</th>
                <th className="p-4 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="text-sm">
              {filtered.map(t => (
                <tr key={t.id} className="border-b border-border/50 last:border-0 hover:bg-muted/30 transition-colors">
                  <td className="p-4">
                    <p className="font-medium text-foreground">{t.name}</p>
                    <p className="text-xs text-muted-foreground font-mono mt-0.5 truncate max-w-[200px]">{t.id}</p>
                  </td>
                  <td className="p-4">
                    <span className={`inline-flex items-center px-2 py-1 rounded-md text-xs font-medium ${
                      t.planId === 'pro' ? 'bg-purple-500/10 text-purple-500 border border-purple-500/20' : 
                      'bg-zinc-500/10 text-zinc-400 border border-zinc-500/20'
                    }`}>
                      {t.planId.toUpperCase()}
                    </span>
                  </td>
                  <td className="p-4">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden w-24">
                        <div 
                          className="h-full bg-blue-500 rounded-full" 
                          style={{ width: `${Math.min(100, ((t.entitlements?.usageApplications || 0) / (t.entitlements?.limitApplications || 1)) * 100)}%` }}
                        />
                      </div>
                      <span className="text-xs text-muted-foreground font-medium">
                        {t._count?.applications || 0} / {t.entitlements?.limitApplications || '?'}
                      </span>
                    </div>
                  </td>
                  <td className="p-4">
                    <span className="text-muted-foreground">{t.entitlements?.usageAiRequests || 0}</span>
                  </td>
                  <td className="p-4 text-right">
                    <button 
                      onClick={async () => {
                        setLoading(true);
                        await upgradeTenantPlan(t.id, t.planId === 'pro' ? 'starter' : 'pro');
                        router.refresh();
                        setLoading(false);
                      }}
                      disabled={loading}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium bg-purple-500/10 text-purple-500 border border-purple-500/20 hover:bg-purple-500/20 transition-colors"
                    >
                      {t.planId === 'pro' ? 'Downgrade Plan' : 'Generate Bachs Invoice'}
                    </button>
                  </td>
                </tr>
              ))}
              
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-muted-foreground">
                    No tenants found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
