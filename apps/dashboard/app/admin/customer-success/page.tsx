'use client'

import { useState, useMemo, useEffect } from 'react'
import {
  HeartHandshake,
  TrendingUp,
  AlertTriangle,
  Zap,
  Calendar,
  Search,
  CheckCircle2,
  RefreshCw,
  Building2,
  SlidersHorizontal,
  X,
  ShieldCheck,
  AlertCircle,
  ExternalLink,
} from 'lucide-react'
import AdminShell from '../AdminShell'

interface CustomerAccountCS {
  id: string
  name: string
  companyDomain: string
  contactName: string
  contactEmail: string
  region: string
  country: string
  plan: string
  healthScore: number
  healthStatus: 'HEALTHY' | 'EXPANSION' | 'AT_RISK' | 'CRITICAL'
  timeToValueMinutes: number | null
  onboardingStage: string
  activeWorkloads: number
  totalWorkloads: number
  quotaUtilizationPercent: number
  recentBuildSuccessRate: number
  lastDeploymentAt: string | null
  chiliPiperMeetingBooked: boolean
  sfdcAccountId: string | null
  sfdcSyncStatus: 'SYNCED' | 'NOT_CONFIGURED' | 'ERROR'
  escalationCount: number
  assignedCsm: string
  createdAt: string
}

interface PortfolioSummary {
  totalAccounts: number
  averageHealthScore: number
  medianTimeToValueMinutes: number | null
  expansionReadyCount: number
  atRiskCount: number
  chiliPiperBookingsThisMonth: number
  integrations: {
    salesforce: { configured: boolean; instanceUrl?: string }
    chiliPiper: { configured: boolean; domain?: string; router?: string }
  }
  activeAccounts: CustomerAccountCS[]
}

export default function CustomerSuccessPage() {
  const [data, setData] = useState<PortfolioSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'HEALTHY' | 'EXPANSION' | 'AT_RISK' | 'CRITICAL'>('ALL')
  const [selectedAccount, setSelectedAccount] = useState<CustomerAccountCS | null>(null)
  const [actionFeedback, setActionFeedback] = useState<{ message: string; type: 'success' | 'warn' } | null>(null)
  const [isActing, setIsActing] = useState(false)

  // Fetch real portfolio from API
  const fetchPortfolio = async () => {
    try {
      setLoading(true)
      const res = await fetch('/api/proxy/v1/customer-success/portfolio', { cache: 'no-store' })
      if (!res.ok) {
        // Fallback directly to backend port if proxy route differs
        const directRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'}/v1/customer-success/portfolio`)
        if (directRes.ok) {
          const directData = await directRes.json()
          setData(directData)
          return
        }
      } else {
        const json = await res.json()
        setData(json)
      }
    } catch {
      // In SSR or unauthenticated state, handle gracefully
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchPortfolio()
  }, [])

  const accounts = data?.activeAccounts || []

  const filteredAccounts = useMemo(() => {
    return accounts.filter((acc) => {
      const matchesSearch =
        acc.name.toLowerCase().includes(search.toLowerCase()) ||
        acc.contactEmail.toLowerCase().includes(search.toLowerCase()) ||
        acc.id.toLowerCase().includes(search.toLowerCase())
      const matchesStatus = statusFilter === 'ALL' || acc.healthStatus === statusFilter
      return matchesSearch && matchesStatus
    })
  }, [accounts, search, statusFilter])

  const handleSyncSFDC = async (account: CustomerAccountCS) => {
    setIsActing(true)
    try {
      const res = await fetch(`/api/proxy/v1/customer-success/accounts/${account.id}/sync-sfdc`, {
        method: 'POST',
      })
      const result = await res.json()
      if (result.success) {
        setActionFeedback({ message: `Synced ${account.name} to Salesforce successfully.`, type: 'success' })
      } else {
        setActionFeedback({ message: result.message || 'Salesforce not configured. Add credentials to .env.', type: 'warn' })
      }
    } catch {
      setActionFeedback({ message: 'Salesforce API unconfigured in environment.', type: 'warn' })
    } finally {
      setIsActing(false)
      setTimeout(() => setActionFeedback(null), 4000)
    }
  }

  const handleFlagUpsell = async (account: CustomerAccountCS) => {
    setIsActing(true)
    try {
      const res = await fetch(`/api/proxy/v1/customer-success/accounts/${account.id}/flag-expansion`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ potentialARR: 18000 }),
      })
      const result = await res.json()
      if (result.success) {
        setActionFeedback({ message: `Expansion Opportunity created in Salesforce for ${account.name}.`, type: 'success' })
      } else {
        setActionFeedback({ message: result.message || 'Salesforce unconfigured: Set credentials to push opportunities.', type: 'warn' })
      }
    } catch {
      setActionFeedback({ message: 'Salesforce opportunity sync requires live API credentials.', type: 'warn' })
    } finally {
      setIsActing(false)
      setTimeout(() => setActionFeedback(null), 4500)
    }
  }

  return (
    <AdminShell usage={accounts.length} limit={Math.max(100, accounts.length)} crumb="Customer Success">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20">
                <HeartHandshake className="h-5 w-5" />
              </div>
              <h1 className="text-2xl font-bold tracking-tight text-foreground">
                Customer Success Command Center
              </h1>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Live customer health, adoption milestones, and expansion signals derived from real PostgreSQL tenant workloads.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={fetchPortfolio}
              disabled={loading}
              className="flex items-center gap-1.5 rounded-lg border border-border/60 bg-muted/30 px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted/50 transition-colors"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh Telemetry
            </button>
          </div>
        </div>

        {/* Global Action Feedback Alert */}
        {actionFeedback && (
          <div
            className={`flex items-center gap-2 rounded-xl border px-4 py-2.5 text-xs font-medium animate-in fade-in duration-200 ${
              actionFeedback.type === 'success'
                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                : 'border-amber-500/30 bg-amber-500/10 text-amber-300'
            }`}
          >
            {actionFeedback.type === 'success' ? (
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
            ) : (
              <AlertCircle className="h-4 w-4 shrink-0 text-amber-400" />
            )}
            {actionFeedback.message}
          </div>
        )}

        {/* KPI Summary Cards */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
          <div className="rounded-2xl border border-border/50 bg-card/60 p-4 shadow-sm backdrop-blur-sm">
            <div className="flex items-center justify-between text-muted-foreground mb-1">
              <span className="text-[11px] font-semibold uppercase tracking-wider">Average Health</span>
              <HeartHandshake className="h-4 w-4 text-emerald-400" />
            </div>
            <div className="text-2xl font-bold text-foreground">
              {data ? data.averageHealthScore : '--'}<span className="text-sm font-normal text-muted-foreground">/100</span>
            </div>
            <div className="text-[11px] text-muted-foreground mt-1">Real compute & uptime telemetry</div>
          </div>

          <div className="rounded-2xl border border-border/50 bg-card/60 p-4 shadow-sm backdrop-blur-sm">
            <div className="flex items-center justify-between text-muted-foreground mb-1">
              <span className="text-[11px] font-semibold uppercase tracking-wider">Median TTV</span>
              <Zap className="h-4 w-4 text-amber-400" />
            </div>
            <div className="text-2xl font-bold text-foreground">
              {data?.medianTimeToValueMinutes !== null && data?.medianTimeToValueMinutes !== undefined
                ? `${data.medianTimeToValueMinutes}m`
                : '--'}
            </div>
            <div className="text-[11px] text-muted-foreground mt-1">Tenant registration to 1st deploy</div>
          </div>

          <div className="rounded-2xl border border-border/50 bg-card/60 p-4 shadow-sm backdrop-blur-sm">
            <div className="flex items-center justify-between text-muted-foreground mb-1">
              <span className="text-[11px] font-semibold uppercase tracking-wider">Expansion Ready</span>
              <TrendingUp className="h-4 w-4 text-blue-400" />
            </div>
            <div className="text-2xl font-bold text-blue-400">{data?.expansionReadyCount ?? 0}</div>
            <div className="text-[11px] text-muted-foreground mt-1">&ge;80% Quota Saturation</div>
          </div>

          <div className="rounded-2xl border border-border/50 bg-card/60 p-4 shadow-sm backdrop-blur-sm">
            <div className="flex items-center justify-between text-muted-foreground mb-1">
              <span className="text-[11px] font-semibold uppercase tracking-wider">At-Risk Tenants</span>
              <AlertTriangle className="h-4 w-4 text-rose-400" />
            </div>
            <div className="text-2xl font-bold text-rose-400">{data?.atRiskCount ?? 0}</div>
            <div className="text-[11px] text-muted-foreground mt-1">Build or probe failures</div>
          </div>

          <div className="rounded-2xl border border-border/50 bg-card/60 p-4 shadow-sm backdrop-blur-sm col-span-2 lg:col-span-1">
            <div className="flex items-center justify-between text-muted-foreground mb-1">
              <span className="text-[11px] font-semibold uppercase tracking-wider">Live Tenants</span>
              <Building2 className="h-4 w-4 text-violet-400" />
            </div>
            <div className="text-2xl font-bold text-violet-400">{accounts.length}</div>
            <div className="text-[11px] text-muted-foreground mt-1">Active PostgreSQL accounts</div>
          </div>
        </div>

        {/* Integration Status Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/50 bg-muted/20 px-4 py-3 text-xs">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground font-medium">Chili Piper Inbound:</span>
              {data?.integrations.chiliPiper.configured ? (
                <span className="inline-flex items-center gap-1 text-emerald-400 font-semibold">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Active ({data.integrations.chiliPiper.router})
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-muted-foreground">
                  <AlertCircle className="h-3.5 w-3.5 text-amber-400" /> Ready for router credentials in .env
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              <span className="text-muted-foreground font-medium">Salesforce REST API:</span>
              {data?.integrations.salesforce.configured ? (
                <span className="inline-flex items-center gap-1 text-emerald-400 font-semibold">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Connected
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-muted-foreground">
                  <AlertCircle className="h-3.5 w-3.5 text-amber-400" /> Unconfigured (Add CLIENT_ID in .env)
                </span>
              )}
            </div>
          </div>
          <span className="text-[11px] text-muted-foreground">Webhook endpoint: /v1/webhooks/chilipiper</span>
        </div>

        {/* Filter & Search Bar */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search live tenant name, email, or ID..."
              className="w-full rounded-xl border border-border/60 bg-muted/30 pl-9 pr-4 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
            {(['ALL', 'HEALTHY', 'EXPANSION', 'AT_RISK', 'CRITICAL'] as const).map((filter) => (
              <button
                key={filter}
                type="button"
                onClick={() => setStatusFilter(filter)}
                className={`rounded-lg px-2.5 py-1.5 text-[11px] font-semibold transition-colors ${
                  statusFilter === filter
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
                }`}
              >
                {filter === 'ALL' ? 'All Live Tenants' : filter.replace('_', ' ')}
              </button>
            ))}
          </div>
        </div>

        {/* Accounts Table */}
        <div className="overflow-hidden rounded-2xl border border-border/50 bg-card shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-border/40 bg-muted/40 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Tenant & User</th>
                  <th className="px-4 py-3">Plan</th>
                  <th className="px-4 py-3">Health Score</th>
                  <th className="px-4 py-3">Time-to-Value</th>
                  <th className="px-4 py-3">Workload Saturation</th>
                  <th className="px-4 py-3">Stage</th>
                  <th className="px-4 py-3">Salesforce</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/30">
                {filteredAccounts.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-muted-foreground text-xs">
                      {loading ? 'Querying PostgreSQL tenant fleet...' : 'No tenants matching the current filter.'}
                    </td>
                  </tr>
                ) : (
                  filteredAccounts.map((acc) => (
                    <tr
                      key={acc.id}
                      className="hover:bg-muted/30 transition-colors cursor-pointer"
                      onClick={() => setSelectedAccount(acc)}
                    >
                      <td className="px-4 py-3.5">
                        <div className="font-semibold text-foreground">{acc.name}</div>
                        <div className="text-[11px] text-muted-foreground font-mono">{acc.id}</div>
                      </td>
                      <td className="px-4 py-3.5">
                        <span className="rounded-md border border-border/60 bg-muted/50 px-2 py-0.5 font-mono text-[10px] font-medium text-foreground">
                          {acc.plan}
                        </span>
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-2">
                          <span
                            className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold ${
                              acc.healthStatus === 'EXPANSION'
                                ? 'bg-blue-500/15 text-blue-400 border border-blue-500/30'
                                : acc.healthStatus === 'HEALTHY'
                                ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                                : 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                            }`}
                          >
                            {acc.healthScore}/100
                          </span>
                          {acc.healthStatus === 'EXPANSION' && (
                            <span className="text-[10px] font-semibold text-blue-400">Expansion Ready</span>
                          )}
                          {(acc.healthStatus === 'AT_RISK' || acc.healthStatus === 'CRITICAL') && (
                            <span className="text-[10px] font-semibold text-rose-400">Attention Needed</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3.5 font-mono text-[11px] text-foreground">
                        {acc.timeToValueMinutes !== null ? `${acc.timeToValueMinutes}m` : 'Pending 1st Deploy'}
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="w-28">
                          <div className="flex justify-between text-[10px] mb-1">
                            <span className="text-muted-foreground">{acc.quotaUtilizationPercent}%</span>
                            <span className="text-muted-foreground">{acc.activeWorkloads} active</span>
                          </div>
                          <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                            <div
                              className={`h-full rounded-full ${
                                acc.quotaUtilizationPercent >= 80 ? 'bg-blue-400' : 'bg-emerald-400'
                              }`}
                              style={{ width: `${acc.quotaUtilizationPercent}%` }}
                            />
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3.5">
                        <span className="rounded-md border border-border/40 bg-muted/30 px-2 py-0.5 text-[10px] text-muted-foreground">
                          {acc.onboardingStage.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td className="px-4 py-3.5">
                        {acc.sfdcSyncStatus === 'SYNCED' ? (
                          <span className="inline-flex items-center gap-1 text-[10px] text-emerald-400">
                            <CheckCircle2 className="h-3 w-3" /> Synced
                          </span>
                        ) : (
                          <span className="text-[10px] text-muted-foreground">Unconfigured</span>
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-right" onClick={(e) => e.stopPropagation()}>
                        {acc.healthStatus === 'EXPANSION' ? (
                          <button
                            type="button"
                            disabled={isActing}
                            onClick={() => handleFlagUpsell(acc)}
                            className="inline-flex items-center gap-1 rounded-lg bg-blue-500/15 border border-blue-500/30 px-2.5 py-1 text-[11px] font-semibold text-blue-300 hover:bg-blue-500/25 transition-colors disabled:opacity-50"
                          >
                            <TrendingUp className="h-3 w-3" /> Flag Upsell
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setSelectedAccount(acc)}
                            className="rounded-lg border border-border/60 bg-muted/40 px-2.5 py-1 text-[11px] font-medium text-foreground hover:bg-muted transition-colors"
                          >
                            Inspect
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <div className="border-t border-border/40 bg-muted/20 px-4 py-2.5 text-xs text-muted-foreground flex items-center justify-between">
            <span>Displaying {filteredAccounts.length} real tenant accounts from database</span>
            <span className="text-[11px]">Real-time telemetry updated live</span>
          </div>
        </div>

        {/* Account Details Drawer Modal */}
        {selectedAccount && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="relative w-full max-w-2xl rounded-2xl border border-border/60 bg-card p-6 shadow-2xl space-y-6">
              <button
                type="button"
                onClick={() => setSelectedAccount(null)}
                className="absolute right-4 top-4 rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>

              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <Building2 className="h-5 w-5 text-primary" />
                    <h3 className="text-lg font-bold text-foreground">{selectedAccount.name}</h3>
                    <span className="rounded-md border border-border/60 bg-muted/40 px-2 py-0.5 text-xs font-mono">
                      {selectedAccount.plan}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5 font-mono">
                    ID: {selectedAccount.id} • Registered {new Date(selectedAccount.createdAt).toLocaleDateString()}
                  </p>
                </div>

                <div className="text-right">
                  <div className="text-xs text-muted-foreground">Computed Health</div>
                  <div className="text-xl font-bold text-foreground">{selectedAccount.healthScore}/100</div>
                </div>
              </div>

              {/* Real Telemetry Details */}
              <div className="rounded-xl border border-border/50 bg-muted/20 p-4 space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-foreground flex items-center gap-1.5">
                    <ShieldCheck className="h-4 w-4 text-emerald-400" />
                    Workload & Deployment Telemetry
                  </span>
                  <span className="text-muted-foreground">Stage: {selectedAccount.onboardingStage}</span>
                </div>

                <div className="grid grid-cols-3 gap-3 text-xs">
                  <div className="rounded-lg bg-card/60 p-2.5 border border-border/40">
                    <span className="text-[10px] text-muted-foreground uppercase block font-semibold">TTV Milestone</span>
                    <span className="font-bold text-foreground">
                      {selectedAccount.timeToValueMinutes !== null ? `${selectedAccount.timeToValueMinutes} mins` : 'N/A'}
                    </span>
                  </div>
                  <div className="rounded-lg bg-card/60 p-2.5 border border-border/40">
                    <span className="text-[10px] text-muted-foreground uppercase block font-semibold">Build Success</span>
                    <span className="font-bold text-foreground">{selectedAccount.recentBuildSuccessRate}%</span>
                  </div>
                  <div className="rounded-lg bg-card/60 p-2.5 border border-border/40">
                    <span className="text-[10px] text-muted-foreground uppercase block font-semibold">Quota Used</span>
                    <span className="font-bold text-foreground">{selectedAccount.quotaUtilizationPercent}%</span>
                  </div>
                </div>
              </div>

              {/* Actions for CSM */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-border/40">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={isActing}
                    onClick={() => handleSyncSFDC(selectedAccount)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border/60 bg-muted px-3 py-2 text-xs font-semibold text-foreground hover:bg-muted/80 transition-colors disabled:opacity-50"
                  >
                    <RefreshCw className="h-3.5 w-3.5" /> Sync to Salesforce
                  </button>

                  <button
                    type="button"
                    disabled={isActing}
                    onClick={() => handleFlagUpsell(selectedAccount)}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-blue-500/15 border border-blue-500/30 px-3 py-2 text-xs font-semibold text-blue-300 hover:bg-blue-500/25 transition-colors disabled:opacity-50"
                  >
                    <TrendingUp className="h-3.5 w-3.5" /> Flag AE Upsell
                  </button>
                </div>

                {data?.integrations.chiliPiper.configured ? (
                  <a
                    href={`https://${data.integrations.chiliPiper.domain}.chilipiper.com/me/csm?email=${encodeURIComponent(selectedAccount.contactEmail)}&tenant_id=${selectedAccount.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
                  >
                    <Calendar className="h-3.5 w-3.5" /> Launch Chili Piper Booking
                  </a>
                ) : (
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <AlertCircle className="h-3.5 w-3.5 text-amber-400" /> Chili Piper router unconfigured
                  </span>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </AdminShell>
  )
}
