import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { UserButton } from '@clerk/nextjs'
import { getEntitlements } from '../actions'
import { Check, Zap, Rocket } from 'lucide-react'
import BillingClientForm from './BillingClientForm'
import AppShell from '../../components/AppShell'
import { isCurrentUserAdmin } from '../../lib/admin'

export default async function BillingPage() {
  const { userId } = await auth();
  if (!userId) redirect('/login');
  
  const [entitlements, isAdmin] = await Promise.all([
    getEntitlements(),
    isCurrentUserAdmin(),
  ])
  const planId = entitlements?.planId || 'starter'
  const usage = entitlements?.usage?.applications || 0
  const limit = entitlements?.limits?.applications || 3

  return (
    <AppShell
      usage={usage}
      limit={limit}
      activePath="/billing"
      planId={planId}
      isAdmin={isAdmin}
      title="Billing"
      crumb="plans"
      actions={<UserButton />}
    >
      <div className="mx-auto max-w-6xl space-y-8 animate-in fade-in duration-500">
        <div className="mx-auto max-w-2xl space-y-4 text-center">
          <h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl">Plans & Billing</h2>
          <p className="text-base text-muted-foreground sm:text-lg">
            Upgrade your AetherHost environment to handle more traffic, deploy more apps, and unlock advanced orchestration. All subscriptions are billed in Nigerian Naira (NGN).
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-8 mt-12">
          
          {/* Starter Plan */}
          <div className={`relative p-8 rounded-3xl border ${planId === 'starter' ? 'border-primary shadow-xl shadow-primary/10' : 'border-border/50 bg-card'}`}>
            {planId === 'starter' && (
              <div className="absolute -top-4 left-1/2 -translate-x-1/2 px-4 py-1 bg-primary text-primary-foreground text-xs font-bold rounded-full shadow-sm uppercase tracking-wide">
                Current Plan
              </div>
            )}
            <h2 className="text-2xl font-bold mb-2">Starter</h2>
            <div className="mb-6 flex flex-wrap items-baseline gap-1">
              <span className="text-3xl font-black sm:text-5xl">₦0</span>
              <span className="text-muted-foreground">/ month</span>
            </div>
            
            <ul className="space-y-4 mb-8">
              <li className="flex items-center gap-3"><Check className="w-5 h-5 text-green-500" /> <span><strong>1</strong> Application</span></li>
              <li className="flex items-center gap-3"><Check className="w-5 h-5 text-green-500" /> <span><strong>512 MB</strong> Storage</span></li>
              <li className="flex items-center gap-3"><Check className="w-5 h-5 text-green-500" /> <span><strong>10</strong> AI Requests</span></li>
              <li className="flex items-center gap-3"><Check className="w-5 h-5 text-green-500" /> <span>Custom Domains</span></li>
              <li className="flex items-center gap-3 text-muted-foreground"><Check className="w-5 h-5 text-muted-foreground/30" /> <span>Shared Compute</span></li>
            </ul>

            <BillingClientForm targetPlan="starter" currentPlan={planId} />
          </div>

          {/* Pro Plan */}
          <div className={`relative p-8 rounded-3xl border ${planId === 'pro' ? 'border-primary shadow-xl shadow-primary/10' : 'border-blue-500/30 bg-blue-500/5'}`}>
            {planId === 'pro' && (
              <div className="absolute -top-4 left-1/2 -translate-x-1/2 px-4 py-1 bg-primary text-primary-foreground text-xs font-bold rounded-full shadow-sm uppercase tracking-wide">
                Current Plan
              </div>
            )}
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-2xl font-bold text-blue-400">Pro</h2>
              <Zap className="w-6 h-6 text-blue-400" />
            </div>
            
            <div className="mb-6 flex flex-wrap items-baseline gap-1">
              <span className="text-3xl font-black sm:text-5xl">₦15,000</span>
              <span className="text-muted-foreground">/ month</span>
            </div>
            
            <ul className="space-y-4 mb-8">
              <li className="flex items-center gap-3"><Check className="w-5 h-5 text-blue-400" /> <span><strong>5</strong> Applications</span></li>
              <li className="flex items-center gap-3"><Check className="w-5 h-5 text-blue-400" /> <span><strong>2 GB</strong> Storage</span></li>
              <li className="flex items-center gap-3"><Check className="w-5 h-5 text-blue-400" /> <span><strong>50</strong> AI Requests</span></li>
              <li className="flex items-center gap-3"><Check className="w-5 h-5 text-blue-400" /> <span>Custom Domains</span></li>
            </ul>

            <BillingClientForm targetPlan="pro" currentPlan={planId} />
          </div>

          {/* Max Plan */}
          <div className={`relative p-8 rounded-3xl border ${planId === 'max' ? 'border-primary shadow-xl shadow-primary/10' : 'border-purple-500/30 bg-purple-500/5'}`}>
            {planId === 'max' && (
              <div className="absolute -top-4 left-1/2 -translate-x-1/2 px-4 py-1 bg-primary text-primary-foreground text-xs font-bold rounded-full shadow-sm uppercase tracking-wide">
                Current Plan
              </div>
            )}
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-2xl font-bold text-purple-400">Max</h2>
              <Rocket className="w-6 h-6 text-purple-400" />
            </div>
            
            <div className="mb-6 flex flex-wrap items-baseline gap-1">
              <span className="text-3xl font-black sm:text-5xl">₦35,000</span>
              <span className="text-muted-foreground">/ month</span>
            </div>
            
            <ul className="space-y-4 mb-8">
              <li className="flex items-center gap-3"><Check className="w-5 h-5 text-purple-400" /> <span><strong>20</strong> Applications</span></li>
              <li className="flex items-center gap-3"><Check className="w-5 h-5 text-purple-400" /> <span><strong>10 GB</strong> Storage</span></li>
              <li className="flex items-center gap-3"><Check className="w-5 h-5 text-purple-400" /> <span><strong>200</strong> AI Requests</span></li>
              <li className="flex items-center gap-3"><Check className="w-5 h-5 text-purple-400" /> <span>Priority Support</span></li>
            </ul>

            <BillingClientForm targetPlan="max" currentPlan={planId} />
          </div>

        </div>
      </div>
    </AppShell>
  )
}
