'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createCheckoutSession } from './actions'

export default function BillingClientForm({ 
  targetPlan, 
  currentPlan, 
  isDowngrade 
}: { 
  targetPlan: string, 
  currentPlan: string, 
  isDowngrade: boolean 
}) {
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  const isCurrent = targetPlan === currentPlan

  return (
    <button
      disabled={loading || isCurrent}
      onClick={async () => {
        setLoading(true)
        try {
          // If downgrading, we can't redirect to payment. Just update via admin for now or mock it
          if (isDowngrade) {
            alert('Downgrades are currently handled by support. Please contact us.');
            setLoading(false);
            return;
          }
          
          const data = await createCheckoutSession(targetPlan);
          if (data.checkoutUrl) {
            window.location.href = data.checkoutUrl
          } else {
            router.refresh()
          }
        } catch (e) {
          console.error(e)
        } finally {
          setLoading(false)
        }
      }}
      className={`w-full py-4 rounded-xl font-bold text-lg transition-all duration-200 active:scale-95 ${
        isCurrent 
          ? 'bg-muted text-muted-foreground cursor-not-allowed opacity-50'
          : targetPlan === 'growth'
            ? 'bg-purple-600 hover:bg-purple-700 text-white shadow-lg shadow-purple-500/20'
            : 'bg-primary text-primary-foreground hover:bg-primary/90'
      }`}
    >
      {loading ? 'Processing...' : isCurrent ? 'Current Plan' : isDowngrade ? 'Downgrade' : 'Upgrade Now'}
    </button>
  )
}
