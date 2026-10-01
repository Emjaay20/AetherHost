'use server'

import { auth } from '@clerk/nextjs/server'

const API_URL = process.env.API_URL ?? 'http://127.0.0.1:3000'

export async function upgradeTenantPlan(tenantId: string, planId: string) {
  const { userId, getToken } = await auth();
  if (!userId) return { error: 'Unauthorized' };

  // Generate a mock Bachs transaction ID
  const eventId = `bachs_inv_${Date.now()}_${Math.random().toString(36).substring(7)}`;

  // Hit the simulate endpoint directly since Bachs is our mock provider
  const res = await fetch(`${API_URL}/v1/billing/simulate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      tenantId,
      planId,
      provider: 'bachs',
      providerEventId: eventId
    }),
    cache: 'no-store'
  });

  if (!res.ok) {
    return { error: 'Failed to generate Bachs invoice and upgrade plan.' }
  }

  return { success: true }
}
