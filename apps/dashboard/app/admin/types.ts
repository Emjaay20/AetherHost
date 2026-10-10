export type Meter = {
  used: number
  limit: number
  ratio: number
  headroom: number
}

export type TenantSignal = {
  id: string
  name: string
  planId: string
  subscriptionStatus: string
  createdAt: string
  drift: string[]
  counterDrift: boolean
  score: number
  tokens: number
  meters: {
    applications: Meter & { counted: number }
    aiRequests: Meter
    storageMb: Meter
    bandwidthGb: Meter
  }
}

export type CatalogPlan = {
  id: string
  name: string
  monthlyPriceCent: number
  limits: {
    applications: number
    aiRequests: number
    storageMb: number
    bandwidthGb: number
  }
}

export type Overview = {
  generatedAt: string
  postgres: 'ok' | 'fail'
  queue: {
    available: boolean
    error?: string
    counts: {
      waiting: number
      active: number
      completed: number
      failed: number
      delayed: number
      paused: number
    } | null
  }
  catalog: CatalogPlan[]
  fleet: {
    counts: Record<string, number>
    total: number
    oldestPending: { id: string; name: string; tenantId: string; ageSeconds: number } | null
    stuckPending: Array<{
      id: string
      name: string
      tenantId: string
      tenantName: string
      runtime: string
      ageSeconds: number
    }>
    recentFailed: Array<{
      id: string
      name: string
      tenantId: string
      tenantName: string
      runtime: string
      healthPath: string
      ageSeconds: number
    }>
  }
  billing: {
    contractedMrrDollars: number
    recognizedMrrDollars: number
    recognizedMonth: string
    pastDueTenants: number
    cancelledTenants: number
    invoices: Array<{ status: string; count: number; amountDollars: number }>
    webhooks: Array<{ status: string; count: number }>
    webhookTotal: number
  }
  system: {
    cpuUsagePct: number
    usedMemGb: number
    totalMemGb: number
    networkOutMbps: number
  }
  analytics: {
    available: boolean
    error?: string
    mrrByMonth: Array<{ month: string; dollars: number }>
    cohorts: Array<{ month: string; newTenants: number }>
    aiUsage: Array<{ tenantId: string; tenantName: string; requests: number; tokens: number }>
  }
  saturation: TenantSignal[]
  driftCount: number
  timeline: Array<{
    id: number
    tenantId: string
    tenantName: string
    applicationId: string | null
    applicationName: string | null
    eventName: string
    payload: Record<string, string | number | boolean> | null
    createdAt: string
  }>
}

export type TenantPage = {
  data: TenantSignal[]
  meta: { total: number; skip: number; take: number; hasMore: boolean }
}

export type TenantDetail = {
  catalog: CatalogPlan[]
  tenant: {
    id: string
    name: string
    planId: string
    subscriptionStatus: string
    subscriptionId: string | null
    createdAt: string
  }
  drift: string[]
  counterDrift: boolean
  score: number
  tokens: number
  meters: TenantSignal['meters']
  apps: Array<{
    id: string
    name: string
    runtime: string
    status: string
    githubRepo: string | null
    customDomain: string | null
    dockerImage: string | null
    workerCommand: string | null
    withPostgres: boolean
    withRedis: boolean
    port: number
    healthPath: string
    createdAt: string
    ageSeconds: number
  }>
  invoices: Array<{
    id: string
    provider: string
    invoiceId: string
    amountDollars: number
    currency: string
    status: string
    createdAt: string
    paidAt: string | null
  }>
  audits: Array<{
    id: string
    action: string
    resourceId: string | null
    metadata: unknown
    createdAt: string
  }>
  events: Array<{
    id: number
    eventName: string
    applicationId: string | null
    applicationName: string | null
    payload: Record<string, string | number | boolean> | null
    createdAt: string
  }>
  webhooks: Array<{
    id: number
    provider: string
    providerEventId: string
    planId: string
    status: string
    createdAt: string
  }>
}
