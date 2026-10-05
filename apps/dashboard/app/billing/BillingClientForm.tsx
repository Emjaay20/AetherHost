'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createCheckoutSession } from './actions'
import { useAuth } from '@clerk/nextjs'

export default function BillingClientForm({ 
  targetPlan, 
  currentPlan
}: { 
  targetPlan: string, 
  currentPlan: string
}) {
  const [loading, setLoading] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [checkoutUrl, setCheckoutUrl] = useState('')
  const [planPrice, setPlanPrice] = useState(0)
  
  // Custom Payment State
  const [enteredAmount, setEnteredAmount] = useState('')
  const [paymentError, setPaymentError] = useState('')

  const router = useRouter()
  const { userId, getToken } = useAuth()

  const isCurrent = targetPlan === currentPlan
  
  const weights: Record<string, number> = { starter: 0, pro: 1, max: 2 }
  const isDowngrade = weights[targetPlan] < weights[currentPlan]

  const priceMap: Record<string, number> = { starter: 0, pro: 10, max: 25 }

  const handleUpgradeClick = async () => {
    setLoading(true)
    try {
      if (isDowngrade) {
        alert('Downgrades are currently handled by support. Please contact us.');
        setLoading(false);
        return;
      }
      
      const data = await createCheckoutSession(targetPlan);
      if (data.checkoutUrl) {
        setCheckoutUrl(data.checkoutUrl)
        setPlanPrice(priceMap[targetPlan])
        setShowModal(true)
      } else {
        router.refresh()
      }
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  const handleSimulatedPayment = async () => {
    const amount = parseFloat(enteredAmount);
    if (isNaN(amount)) {
      setPaymentError('Please enter a valid amount.');
      return;
    }

    if (amount > planPrice) {
      setPaymentError(`That's too much! The exact price is $${planPrice}.00.`);
      return;
    }
    
    if (amount < planPrice) {
      setPaymentError(`That's not enough. The exact price is $${planPrice}.00.`);
      return;
    }

    if (checkoutUrl.includes('simulate=true')) {
      try {
        const token = await getToken();
        // Since it's simulated, we trigger the webhook manually
        await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'}/v1/billing/simulate`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            provider: 'bachs',
            providerEventId: `sim_${Date.now()}`,
            tenantId: userId,
            planId: targetPlan
          })
        });
      } catch (e) {
        console.error('Simulation webhook trigger failed', e);
      }
    }

    // Amount matches exactly
    window.location.href = checkoutUrl;
  }

  return (
    <>
      <button
        disabled={loading || isCurrent}
        onClick={handleUpgradeClick}
        className={`w-full py-4 rounded-xl font-bold text-lg transition-all duration-200 active:scale-95 ${
          isCurrent 
            ? 'bg-muted text-muted-foreground cursor-not-allowed opacity-50'
            : targetPlan === 'max'
              ? 'bg-purple-600 hover:bg-purple-700 text-white shadow-lg shadow-purple-500/20'
              : targetPlan === 'pro'
                ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-500/20'
                : 'bg-primary text-primary-foreground hover:bg-primary/90'
        }`}
      >
        {loading ? 'Processing...' : isCurrent ? 'Current Plan' : isDowngrade ? 'Downgrade' : 'Upgrade Now'}
      </button>

      {/* Inline Payment Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-card text-card-foreground p-8 rounded-2xl shadow-2xl max-w-md w-full border border-border">
            <h3 className="text-2xl font-bold mb-4">Complete Payment</h3>
            <p className="text-muted-foreground mb-4">
              You are upgrading to the <strong>{targetPlan.toUpperCase()}</strong> plan. 
              The required amount is <strong>${planPrice}.00</strong>.
            </p>
            
            <div className="bg-muted p-4 rounded-lg mb-4">
              <label className="block text-sm font-medium mb-2">Enter payment amount ($):</label>
              <input 
                type="number"
                value={enteredAmount}
                onChange={e => {
                  setEnteredAmount(e.target.value);
                  setPaymentError('');
                }}
                className="w-full bg-background border border-border px-4 py-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder={`e.g. ${planPrice}`}
              />
            </div>

            {paymentError && (
              <div className="p-3 mb-6 bg-red-500/10 border border-red-500/20 text-red-500 rounded-lg text-sm font-medium">
                {paymentError}
              </div>
            )}

            <div className="flex gap-4 mt-6">
              <button 
                onClick={() => {
                  setShowModal(false)
                  setEnteredAmount('')
                  setPaymentError('')
                }}
                className="flex-1 py-3 rounded-xl border border-border hover:bg-muted font-medium transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={handleSimulatedPayment}
                className="flex-1 py-3 rounded-xl bg-green-600 hover:bg-green-700 text-white font-bold shadow-lg transition-colors"
              >
                Pay & Upgrade
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
