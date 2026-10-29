'use client'

import { useState, useMemo } from 'react'
import {
  HeartHandshake,
  TrendingUp,
  AlertTriangle,
  Zap,
  Calendar,
  Search,
  ExternalLink,
  CheckCircle2,
  RefreshCw,
  Building2,
  Globe2,
  SlidersHorizontal,
  X,
  Send,
  ShieldAlert,
} from 'lucide-react'
import AdminShell from '../AdminShell'

interface AccountCS {
  id: string
  name: string
  companyDomain: string
  contactName: string
  contactEmail: string
  country: string
  plan: 'Starter' | 'Growth' | 'Scale' | 'Enterprise'
  healthScore: number
  healthStatus: 'HEALTHY' | 'EXPANSION' | 'AT_RISK' | 'CRITICAL'
  timeToValueMinutes: number
  onboardingStage: string
  activeWorkloads: number
  quotaUtilizationPercent: number
  recentBuildSuccessRate: number
  chiliPiperMeetingBooked: boolean
  sfdcAccountId: string
  sfdcSyncStatus: 'SYNCED' | 'PENDING'
  escalationCount: number
}

// 85 EMEA Portfolio Accounts matching the API seed data
const INITIAL_ACCOUNTS: AccountCS[] = [
  {
    id: 'tenant_fintech_uk',
    name: 'PayBridge UK Ltd',
    companyDomain: 'paybridge.co.uk',
    contactName: 'Oliver Smith',
    contactEmail: 'oliver@paybridge.co.uk',
    country: 'United Kingdom',
    plan: 'Enterprise',
    healthScore: 96,
    healthStatus: 'EXPANSION',
    timeToValueMinutes: 2.8,
    onboardingStage: 'ONBOARDING_COMPLETED',
    activeWorkloads: 24,
    quotaUtilizationPercent: 88,
    recentBuildSuccessRate: 98,
    chiliPiperMeetingBooked: true,
    sfdcAccountId: '001EMEA00192',
    sfdcSyncStatus: 'SYNCED',
    escalationCount: 0,
  },
  {
    id: 'tenant_retail_de',
    name: 'ZalFlow Retail GmbH',
    companyDomain: 'zalflow.de',
    contactName: 'Maximilian Bauer',
    contactEmail: 'm.bauer@zalflow.de',
    country: 'Germany',
    plan: 'Scale',
    healthScore: 88,
    healthStatus: 'HEALTHY',
    timeToValueMinutes: 3.4,
    onboardingStage: 'ONBOARDING_COMPLETED',
    activeWorkloads: 14,
    quotaUtilizationPercent: 62,
    recentBuildSuccessRate: 94,
    chiliPiperMeetingBooked: true,
    sfdcAccountId: '001EMEA00341',
    sfdcSyncStatus: 'SYNCED',
    escalationCount: 0,
  },
  {
    id: 'tenant_health_se',
    name: 'NordicPulse Health AB',
    companyDomain: 'nordicpulse.se',
    contactName: 'Astrid Lindgren',
    contactEmail: 'astrid@nordicpulse.se',
    country: 'Sweden',
    plan: 'Growth',
    healthScore: 48,
    healthStatus: 'AT_RISK',
    timeToValueMinutes: 4.1,
    onboardingStage: 'CUSTOM_DOMAIN_VERIFIED',
    activeWorkloads: 6,
    quotaUtilizationPercent: 35,
    recentBuildSuccessRate: 65,
    chiliPiperMeetingBooked: false,
    sfdcAccountId: '001EMEA00482',
    sfdcSyncStatus: 'SYNCED',
    escalationCount: 2,
  },
  {
    id: 'tenant_logistics_nl',
    name: 'PortSmart Logistics B.V.',
    companyDomain: 'portsmart.nl',
    contactName: 'Daan van Dijk',
    contactEmail: 'daan@portsmart.nl',
    country: 'Netherlands',
    plan: 'Scale',
    healthScore: 92,
    healthStatus: 'EXPANSION',
    timeToValueMinutes: 2.5,
    onboardingStage: 'ONBOARDING_COMPLETED',
    activeWorkloads: 18,
    quotaUtilizationPercent: 82,
    recentBuildSuccessRate: 100,
    chiliPiperMeetingBooked: true,
    sfdcAccountId: '001EMEA00519',
    sfdcSyncStatus: 'SYNCED',
    escalationCount: 0,
  },
  {
    id: 'tenant_cloudops_fr',
    name: 'AzurData Solutions SAS',
    companyDomain: 'azurdata.fr',
    contactName: 'Camille Dubois',
    contactEmail: 'camille@azurdata.fr',
    country: 'France',
    plan: 'Starter',
    healthScore: 32,
    healthStatus: 'CRITICAL',
    timeToValueMinutes: 6.2,
    onboardingStage: 'FIRST_CONTAINER_DEPLOYED',
    activeWorkloads: 2,
    quotaUtilizationPercent: 12,
    recentBuildSuccessRate: 40,
    chiliPiperMeetingBooked: false,
    sfdcAccountId: '001EMEA00604',
    sfdcSyncStatus: 'PENDING',
    escalationCount: 3,
  },
  ...Array.from({ length: 80 }).map((_, i) => {
    const idx = i + 6
    const countries = ['United Kingdom', 'Germany', 'France', 'Netherlands', 'Ireland', 'Spain', 'Switzerland', 'Sweden']
    const plans: Array<'Starter' | 'Growth' | 'Scale' | 'Enterprise'> = ['Starter', 'Growth', 'Scale', 'Enterprise']
    const country = countries[idx % countries.length]
    const plan = plans[idx % plans.length]
    const quota = 25 + ((idx * 13) % 70)
    const buildRate = 80 + ((idx * 7) % 21)
    const isExpansion = quota >= 80
    const isRisk = buildRate < 70

    return {
      id: `tenant_emea_${idx}`,
      name: `EMEA Enterprise Corp ${idx}`,
      companyDomain: `corp${idx}.eu`,
      contactName: `Tech Lead ${idx}`,
      contactEmail: `lead${idx}@corp${idx}.eu`,
      country,
      plan,
      healthScore: isExpansion ? 90 + (idx % 8) : isRisk ? 42 : 75 + (idx % 20),
      healthStatus: isExpansion ? 'EXPANSION' : isRisk ? 'AT_RISK' : 'HEALTHY',
      timeToValueMinutes: +(2.0 + (idx % 25) / 10).toFixed(1),
      onboardingStage: idx % 6 === 0 ? 'KICKOFF_SCHEDULED' : 'ONBOARDING_COMPLETED',
      activeWorkloads: 4 + (idx % 16),
      quotaUtilizationPercent: quota,
      recentBuildSuccessRate: buildRate,
      chiliPiperMeetingBooked: idx % 3 === 0,
      sfdcAccountId: `001EMEA${idx.toString().padStart(5, '0')}`,
      sfdcSyncStatus: 'SYNCED',
      escalationCount: idx % 12 === 0 ? 1 : 0,
    } as AccountCS
  }),
]

export default function CustomerSuccessPage() {
  const [accounts, setAccounts] = useState<AccountCS[]>(INITIAL_ACCOUNTS)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'HEALTHY' | 'EXPANSION' | 'AT_RISK' | 'CRITICAL'>('ALL')
  const [selectedAccount, setSelectedAccount] = useState<AccountCS | null>(null)
  const [syncFeedback, setSyncFeedback] = useState<string | null>(null)

  const filteredAccounts = useMemo(() => {
    return accounts.filter((acc) => {
      const matchesSearch =
        acc.name.toLowerCase().includes(search.toLowerCase()) ||
        acc.contactEmail.toLowerCase().includes(search.toLowerCase()) ||
        acc.country.toLowerCase().includes(search.toLowerCase())
      const matchesStatus = statusFilter === 'ALL' || acc.healthStatus === statusFilter
      return matchesSearch && matchesStatus
    })
  }, [accounts, search, statusFilter])

  // Summary Metrics
  const avgHealth = Math.round(accounts.reduce((s, a) => s + a.healthScore, 0) / accounts.length)
  const medianTTV = 3.1
  const expansionCount = accounts.filter((a) => a.healthStatus === 'EXPANSION').length
  const riskCount = accounts.filter((a) => a.healthStatus === 'AT_RISK' || a.healthStatus === 'CRITICAL').length
  const chiliPiperBookedCount = accounts.filter((a) => a.chiliPiperMeetingBooked).length

  const handleSyncSFDC = (accountId: string) => {
    setSyncFeedback('Syncing with Salesforce REST API & updating Aether_Tenant__c...')
    setTimeout(() => {
      setAccounts((prev) =>
        prev.map((a) => (a.id === accountId ? { ...a, sfdcSyncStatus: 'SYNCED' } : a))
      )
      setSyncFeedback('Successfully synced to Salesforce Standard Account & Custom Objects.')
      setTimeout(() => setSyncFeedback(null), 3500)
    }, 800)
  }

  const handleFlagUpsell = (acc: AccountCS) => {
    setSyncFeedback(`Expansion brief flagged! Salesforce Opportunity created for AE pipeline ($${acc.plan === 'Enterprise' ? '45,000' : '18,000'} ARR).`)
    setTimeout(() => setSyncFeedback(null), 4000)
  }

  return (
    <AdminShell usage={accounts.length} limit={100} crumb="Customer Success">
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
              Portfolio management for 85 EMEA enterprise accounts. Integrated with Chili Piper & Salesforce.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded-full border border-blue-500/30 bg-blue-500/10 px-3 py-1 text-xs font-semibold text-blue-400">
              EMEA Portfolio (85 Accounts)
            </span>
          </div>
        </div>

        {/* Global Action Feedback Alert */}
        {syncFeedback && (
          <div className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2.5 text-xs font-medium text-emerald-300 animate-in fade-in duration-200">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
            {syncFeedback}
          </div>
        )}

        {/* KPI Summary Cards */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
          <div className="rounded-2xl border border-border/50 bg-card/60 p-4 shadow-sm backdrop-blur-sm">
            <div className="flex items-center justify-between text-muted-foreground mb-1">
              <span className="text-[11px] font-semibold uppercase tracking-wider">Portfolio Health</span>
              <HeartHandshake className="h-4 w-4 text-emerald-400" />
            </div>
            <div className="text-2xl font-bold text-foreground">{avgHealth}<span className="text-sm font-normal text-muted-foreground">/100</span></div>
            <div className="text-[11px] text-emerald-400 font-medium mt-1">Healthy Enterprise Cohort</div>
          </div>

          <div className="rounded-2xl border border-border/50 bg-card/60 p-4 shadow-sm backdrop-blur-sm">
            <div className="flex items-center justify-between text-muted-foreground mb-1">
              <span className="text-[11px] font-semibold uppercase tracking-wider">Median TTV</span>
              <Zap className="h-4 w-4 text-amber-400" />
            </div>
            <div className="text-2xl font-bold text-foreground">{medianTTV}<span className="text-sm font-normal text-muted-foreground"> mins</span></div>
            <div className="text-[11px] text-muted-foreground mt-1">Time to 1st Deployment</div>
          </div>

          <div className="rounded-2xl border border-border/50 bg-card/60 p-4 shadow-sm backdrop-blur-sm">
            <div className="flex items-center justify-between text-muted-foreground mb-1">
              <span className="text-[11px] font-semibold uppercase tracking-wider">Expansion Ready</span>
              <TrendingUp className="h-4 w-4 text-blue-400" />
            </div>
            <div className="text-2xl font-bold text-blue-400">{expansionCount}</div>
            <div className="text-[11px] text-muted-foreground mt-1">&gt;80% Quota (Push to AE)</div>
          </div>

          <div className="rounded-2xl border border-border/50 bg-card/60 p-4 shadow-sm backdrop-blur-sm">
            <div className="flex items-center justify-between text-muted-foreground mb-1">
              <span className="text-[11px] font-semibold uppercase tracking-wider">At-Risk Accounts</span>
              <AlertTriangle className="h-4 w-4 text-rose-400" />
            </div>
            <div className="text-2xl font-bold text-rose-400">{riskCount}</div>
            <div className="text-[11px] text-muted-foreground mt-1">Requires CSM Outreach</div>
          </div>

          <div className="rounded-2xl border border-border/50 bg-card/60 p-4 shadow-sm backdrop-blur-sm col-span-2 lg:col-span-1">
            <div className="flex items-center justify-between text-muted-foreground mb-1">
              <span className="text-[11px] font-semibold uppercase tracking-wider">Chili Piper Sessions</span>
              <Calendar className="h-4 w-4 text-violet-400" />
            </div>
            <div className="text-2xl font-bold text-violet-400">{chiliPiperBookedCount}</div>
            <div className="text-[11px] text-muted-foreground mt-1">Booked via Instant Booker</div>
          </div>
        </div>

        {/* Filter & Search Bar */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter by account, lead email, or EMEA country..."
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
                {filter === 'ALL' ? 'All Accounts' : filter.replace('_', ' ')}
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
                  <th className="px-4 py-3">Account & Lead</th>
                  <th className="px-4 py-3">Country</th>
                  <th className="px-4 py-3">Plan</th>
                  <th className="px-4 py-3">Health Score</th>
                  <th className="px-4 py-3">TTV</th>
                  <th className="px-4 py-3">Quota</th>
                  <th className="px-4 py-3">Salesforce (SFDC)</th>
                  <th className="px-4 py-3">Chili Piper</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/30">
                {filteredAccounts.slice(0, 20).map((acc) => {
                  return (
                    <tr
                      key={acc.id}
                      className="hover:bg-muted/30 transition-colors cursor-pointer"
                      onClick={() => setSelectedAccount(acc)}
                    >
                      <td className="px-4 py-3.5">
                        <div className="font-semibold text-foreground">{acc.name}</div>
                        <div className="text-[11px] text-muted-foreground">{acc.contactEmail}</div>
                      </td>
                      <td className="px-4 py-3.5 text-muted-foreground flex items-center gap-1.5 mt-1">
                        <Globe2 className="h-3.5 w-3.5 text-muted-foreground/70" />
                        {acc.country}
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
                            <span className="text-[10px] font-semibold text-rose-400">Risk</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3.5 font-mono text-[11px] text-foreground">
                        {acc.timeToValueMinutes}m
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="w-24">
                          <div className="flex justify-between text-[10px] mb-1">
                            <span className="text-muted-foreground">{acc.quotaUtilizationPercent}%</span>
                            <span className="text-muted-foreground">{acc.activeWorkloads} apps</span>
                          </div>
                          <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                            <div
                              className={`h-full rounded-full ${
                                acc.quotaUtilizationPercent > 80 ? 'bg-blue-400' : 'bg-emerald-400'
                              }`}
                              style={{ width: `${acc.quotaUtilizationPercent}%` }}
                            />
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-1.5 font-mono text-[10px] text-muted-foreground">
                          <CheckCircle2 className="h-3 w-3 text-emerald-400" />
                          {acc.sfdcAccountId}
                        </div>
                      </td>
                      <td className="px-4 py-3.5">
                        {acc.chiliPiperMeetingBooked ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-violet-500/10 border border-violet-500/20 px-2 py-0.5 text-[10px] font-medium text-violet-300">
                            <Calendar className="h-2.5 w-2.5" /> Booked
                          </span>
                        ) : (
                          <span className="text-[10px] text-muted-foreground">None</span>
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-right" onClick={(e) => e.stopPropagation()}>
                        {acc.healthStatus === 'EXPANSION' ? (
                          <button
                            type="button"
                            onClick={() => handleFlagUpsell(acc)}
                            className="inline-flex items-center gap-1 rounded-lg bg-blue-500/15 border border-blue-500/30 px-2.5 py-1 text-[11px] font-semibold text-blue-300 hover:bg-blue-500/25 transition-colors"
                          >
                            <TrendingUp className="h-3 w-3" /> Flag AE
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
                  )
                })}
              </tbody>
            </table>
          </div>
          <div className="border-t border-border/40 bg-muted/20 px-4 py-2.5 text-xs text-muted-foreground flex items-center justify-between">
            <span>Showing top 20 of {filteredAccounts.length} EMEA accounts</span>
            <span className="text-[11px]">Real-time telemetry synced with NestJS control plane</span>
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
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {selectedAccount.companyDomain} • {selectedAccount.country} (EMEA)
                  </p>
                </div>

                <div className="text-right">
                  <div className="text-xs text-muted-foreground">Health Index</div>
                  <div className="text-xl font-bold text-foreground">{selectedAccount.healthScore}/100</div>
                </div>
              </div>

              {/* Salesforce Custom Object Details */}
              <div className="rounded-xl border border-border/50 bg-muted/20 p-4 space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-foreground flex items-center gap-1.5">
                    <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                    Salesforce Custom Object: Aether_Tenant__c
                  </span>
                  <span className="font-mono text-muted-foreground">{selectedAccount.sfdcAccountId}</span>
                </div>

                <div className="grid grid-cols-3 gap-3 text-xs">
                  <div className="rounded-lg bg-card/60 p-2.5 border border-border/40">
                    <span className="text-[10px] text-muted-foreground uppercase block font-semibold">TTV Milestone</span>
                    <span className="font-bold text-foreground">{selectedAccount.timeToValueMinutes} minutes</span>
                  </div>
                  <div className="rounded-lg bg-card/60 p-2.5 border border-border/40">
                    <span className="text-[10px] text-muted-foreground uppercase block font-semibold">Build Success Rate</span>
                    <span className="font-bold text-foreground">{selectedAccount.recentBuildSuccessRate}%</span>
                  </div>
                  <div className="rounded-lg bg-card/60 p-2.5 border border-border/40">
                    <span className="text-[10px] text-muted-foreground uppercase block font-semibold">Quota Utilization</span>
                    <span className="font-bold text-foreground">{selectedAccount.quotaUtilizationPercent}%</span>
                  </div>
                </div>
              </div>

              {/* Actions for CSM */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-border/40">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleSyncSFDC(selectedAccount.id)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border/60 bg-muted px-3 py-2 text-xs font-semibold text-foreground hover:bg-muted/80 transition-colors"
                  >
                    <RefreshCw className="h-3.5 w-3.5" /> Force SFDC Sync
                  </button>

                  <button
                    type="button"
                    onClick={() => handleFlagUpsell(selectedAccount)}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-blue-500/15 border border-blue-500/30 px-3 py-2 text-xs font-semibold text-blue-300 hover:bg-blue-500/25 transition-colors"
                  >
                    <TrendingUp className="h-3.5 w-3.5" /> Flag AE Upsell
                  </button>
                </div>

                <a
                  href={`https://aetherhost.chilipiper.com/me/emea-technical-csm?email=${selectedAccount.contactEmail}&tenant_id=${selectedAccount.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
                >
                  <Calendar className="h-3.5 w-3.5" /> Launch Chili Piper Booking
                </a>
              </div>
            </div>
          </div>
        )}
      </div>
    </AdminShell>
  )
}
