'use server'

import { revalidatePath } from 'next/cache'
import { auth } from '@clerk/nextjs/server'

const API_URL = process.env.API_URL ?? process.env.CONTROL_PLANE_URL ?? 'http://127.0.0.1:3000'

function parseEnv(raw: string): Record<string, string> | { error: string } {
  const env: Record<string, string> = {}
  if (!raw.trim()) return env
  for (const line of raw.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq <= 0) return { error: `Invalid env line: ${trimmed}` }
    const key = trimmed.slice(0, eq).trim()
    const value = trimmed.slice(eq + 1)
    if (!/^[A-Z_][A-Z0-9_]*$/.test(key)) return { error: `Invalid env key: ${key}` }
    env[key] = value
  }
  return env
}

export async function getEntitlements() {
  const { userId, getToken } = await auth();
  if (!userId) return null;
  const token = await getToken();

  try {
    const res = await fetch(`${API_URL}/v1/entitlements`, { 
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
  const githubRepo = String(formData.get('githubRepo') ?? '').trim()
  const dockerImage = String(formData.get('dockerImage') ?? '').trim()
  const body: Record<string, unknown> = { name, runtime }
  if (githubRepo) body.githubRepo = githubRepo
  if (dockerImage) {
    body.dockerImage = dockerImage
    const workerCommand = String(formData.get('workerCommand') ?? '').trim()
    const healthPath = String(formData.get('healthPath') ?? '').trim()
    const portRaw = String(formData.get('port') ?? '').trim()
    if (workerCommand) body.workerCommand = workerCommand
    if (healthPath) body.healthPath = healthPath
    if (portRaw) body.port = Number(portRaw)
    body.withPostgres = formData.get('withPostgres') === 'true'
    body.withRedis = formData.get('withRedis') === 'true'
    const env = parseEnv(String(formData.get('envVars') ?? ''))
    if ('error' in env) return { error: env.error }
    if (Object.keys(env).length > 0) body.envVars = env
  }

  try {
    const res = await fetch(`${API_URL}/v1/applications`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify(body)
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
      `${API_URL}/v1/events`,
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
      body: JSON.stringify({})
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
  const repositoryName = formData.get('repositoryName') as string | null;
  const repositoryDescription = formData.get('repositoryDescription') as string | null;
  const generateDescription = formData.get('generateDescriptionValue') === 'true';

  try {
    const res = await fetch(`${API_URL}/v1/ai/provision`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ prompt, repositoryName, repositoryDescription, generateDescription })
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
