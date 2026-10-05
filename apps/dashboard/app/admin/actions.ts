'use server'

import { auth } from '@clerk/nextjs/server'

const API_URL = process.env.API_URL ?? 'http://127.0.0.1:3000'

export async function upgradeTenantPlan(tenantId: string, planId: string) {
  const { userId } = await auth();
  if (!userId) return { error: 'Unauthorized' };

  // Create a checkout session on the Bachs API
  try {
    if (process.env.BILLING_ALLOW_SIMULATE === 'true') {
      return { checkoutUrl: `http://localhost:3002/admin?success=true&simulate=true&plan=${planId}` };
    }
    const baseUrl = process.env.BACHS_SECRET_KEY?.startsWith('sk_sandbox_') 
      ? 'https://sandbox-api.bachs.io' 
      : 'https://api.bachs.io';

    const res = await fetch(`${baseUrl}/v1/checkout-sessions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.BACHS_SECRET_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        customer: { email: `${tenantId}@test.com`, name: tenantId },
        product_cart: [{ product_id: planId }], // e.g. "growth"
        payment_method_types: ['USD_CARD'],
        metadata: {
          tenantId: tenantId,
          planId: planId
        },
        success_url: 'http://localtest.me:3002/admin',
        cancel_url: 'http://localtest.me:3002/admin'
      })
    });

    if (!res.ok) {
      const errorText = await res.text();
      console.error('Failed to create Bachs checkout session:', errorText);
      return { error: 'Failed to connect to Bachs.io API' };
    }

    const data = await res.json();
    return { checkoutUrl: data.url }; // Return the URL so the dashboard can redirect
  } catch (error) {
    console.error('Error contacting Bachs.io:', error);
    return { error: 'Network error connecting to Bachs.io' };
  }
}
