'use server'

import { revalidatePath } from 'next/cache'
import { auth } from '@clerk/nextjs/server'

const API_URL = 'http://localhost:3000'

export async function getEntitlements() {
  const { userId, getToken } = await auth();
  if (!userId) return null;
  const token = await getToken();

  try {
    const res = await fetch(`${API_URL}/v1/entitlements/${userId}`, { 
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store' 
    })
    if (!res.ok) return null
    return res.json()
  } catch (error) {
    console.error(error)
    return null
  }
}

export async function getApplications() {
  const { userId, getToken } = await auth();
  if (!userId) return [];
  const token = await getToken();

  try {
    const res = await fetch(`${API_URL}/v1/applications`, { 
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store' 
    })
    if (!res.ok) return []
    const apps = await res.json()
    return apps
  } catch (error) {
    console.error(error)
    return []
  }
}

export async function createApplication(formData: FormData) {
  const { userId, getToken } = await auth();
  if (!userId) return { error: 'Unauthorized' };
  const token = await getToken();

  const name = formData.get('name') as string
  const runtime = formData.get('runtime') as string

  try {
    const res = await fetch(`${API_URL}/v1/applications`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ tenantId: userId, name, runtime })
    })

    if (!res.ok) {
      const error = await res.json()
      return { error: error.message || 'Failed to create application' }
    }

    revalidatePath('/')
    return { success: true }
  } catch (error) {
    return { error: 'Network error communicating with API' }
  }
}

export async function getEvents() {
  const { userId, getToken } = await auth();
  if (!userId) return [];
  const token = await getToken();

  try {
    const res = await fetch(
      `${API_URL}/v1/events?tenantId=${userId}`,
      { 
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store' 
      },
    );
    if (!res.ok) throw new Error('Failed to load events');
    return res.json();
  } catch (error) {
    console.error(error);
    return [];
  }
}

export async function runProvisioner() {
  const { getToken } = await auth();
  const token = await getToken();
  try {
    await fetch(`${API_URL}/v1/provisioning/tick`, { 
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` }
    });
    revalidatePath('/');
  } catch (error) {
    console.error(error);
  }
}

export async function generateOpsInsight() {
  const { userId, getToken } = await auth();
  if (!userId) return { error: 'Unauthorized' };
  const token = await getToken();

  try {
    const res = await fetch(`${API_URL}/v1/ai/insights/ops`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ tenantId: userId })
    });
    
    if (!res.ok) {
      const error = await res.json();
      return { error: error.message || 'Failed to generate insight' };
    }
    
    return { data: await res.json() };
  } catch (error) {
    return { error: 'Network error' };
  }
}

export async function promptApplication(formData: FormData) {
  const { userId, getToken } = await auth();
  if (!userId) return { error: 'Unauthorized' };
  const token = await getToken();

  const prompt = formData.get('prompt') as string;

  try {
    const res = await fetch(`${API_URL}/v1/ai/provision`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ tenantId: userId, prompt })
    });

    if (!res.ok) {
      const error = await res.json();
      return { error: error.message || 'Failed to parse prompt' };
    }

    revalidatePath('/');
    return { success: true };
  } catch (error) {
    return { error: 'Network error communicating with API' };
  }
}

export async function deleteApplication(id: string) {
  const { userId, getToken } = await auth();
  if (!userId) return { error: 'Unauthorized' };
  const token = await getToken();

  try {
    const res = await fetch(`${API_URL}/v1/applications/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!res.ok) {
      return { error: 'Failed to delete application' };
    }

    revalidatePath('/');
    return { success: true };
  } catch (error) {
    return { error: 'Network error communicating with API' };
  }
}
