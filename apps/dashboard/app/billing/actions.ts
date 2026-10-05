'use server'

import { auth } from '@clerk/nextjs/server'

const API_URL = process.env.API_URL ?? 'http://127.0.0.1:3000'

export async function createCheckoutSession(planId: string) {
  const { userId, getToken } = await auth();
  if (!userId) throw new Error('Unauthorized');
  
  const token = await getToken();
  
  const res = await fetch(`${API_URL}/v1/billing/checkout`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({ planId, provider: 'bachs' }),
    cache: 'no-store'
  });
  
  if (!res.ok) {
    const errorText = await res.text();
    console.error('API Error:', res.status, errorText);
    throw new Error('Failed to create checkout');
  }
  return res.json();
}
