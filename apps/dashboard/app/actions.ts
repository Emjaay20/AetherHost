'use server'

import { revalidatePath } from 'next/cache'
import { auth } from '@clerk/nextjs/server'
import { resolveApiUrl } from '../lib/domain'

const API_URL = resolveApiUrl()

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

async function getAuthHeaders(extraHeaders: Record<string, string> = {}): Promise<Record<string, string> | null> {
  const { userId, getToken } = await auth();
  if (!userId) return null;
  const token = await getToken();
  if (!token) return null;

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    ...extraHeaders,
  };

  try {
    const { cookies } = await import('next/headers');
    const cookieStore = await cookies();
    const impersonatedTenantId = cookieStore.get('aether_impersonate_tenant')?.value;
    if (impersonatedTenantId) {
      headers['x-impersonate-tenant'] = impersonatedTenantId;
    }
  } catch {
    // cookies() unavailable outside request scope
  }

  return headers;
}

export async function getEntitlements() {
  const headers = await getAuthHeaders();
  if (!headers) return null;

  try {
    const res = await fetch(`${API_URL}/v1/entitlements`, { 
      headers,
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
  const headers = await getAuthHeaders();
  if (!headers) return [];

  try {
    const res = await fetch(`${API_URL}/v1/applications`, { 
      headers,
      cache: 'no-store' 
    })
    if (!res.ok) {
      console.error(`[getApplications] API error ${res.status}: ${res.statusText}`);
      return [];
    }
    const apps = await res.json()
    return Array.isArray(apps) ? apps : []
  } catch (error) {
    console.error('[getApplications] Network error:', error)
    return []
  }
}

export async function createApplication(formData: FormData) {
  const headers = await getAuthHeaders({ 'Content-Type': 'application/json' });
  if (!headers) return { error: 'Unauthorized' };

  const name = formData.get('name') as string
  const runtime = formData.get('runtime') as string
  const githubRepo = String(formData.get('githubRepo') ?? '').trim()
  const dockerImage = String(formData.get('dockerImage') ?? '').trim()
  const customDomain = String(formData.get('customDomain') ?? '').trim()
  const body: Record<string, unknown> = { name, runtime }
  if (githubRepo) body.githubRepo = githubRepo
  if (customDomain) body.customDomain = customDomain
  
  const env = parseEnv(String(formData.get('envVars') ?? ''))
  if ('error' in env) return { error: env.error }
  if (Object.keys(env).length > 0) body.envVars = env

  if (dockerImage) {
    body.dockerImage = dockerImage
    const workerCommand = String(formData.get('workerCommand') ?? '').trim()
    const healthPath = String(formData.get('healthPath') ?? '').trim()
    const portRaw = String(formData.get('port') ?? '').trim()
    if (workerCommand) body.workerCommand = workerCommand
    if (healthPath) body.healthPath = healthPath
    if (portRaw) body.port = Number(portRaw)
    body.withPostgres = formData.get('withPostgres') === 'true'
    body.withMariaDb = formData.get('withMariaDb') === 'true'
    body.withRedis = formData.get('withRedis') === 'true'
  }

  try {
    const res = await fetch(`${API_URL}/v1/applications`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body)
    })

    if (!res.ok) {
      const error = await res.json()
      return { error: error.message || 'Failed to create application' }
    }

    revalidatePath('/console')
    revalidatePath('/')
    return { success: true }
  } catch (error) {
    return { error: 'Network error communicating with API' }
  }
}

export async function getEvents() {
  const headers = await getAuthHeaders();
  if (!headers) return [];

  try {
    const res = await fetch(
      `${API_URL}/v1/events`,
      { 
        headers,
        cache: 'no-store' 
      },
    );
    if (!res.ok) {
      console.warn(`[getEvents] API returned status ${res.status}`);
      return [];
    }
    return res.json();
  } catch (error) {
    console.error(error);
    return [];
  }
}

export async function runProvisioner() {
  const headers = await getAuthHeaders();
  if (!headers) return;
  try {
    await fetch(`${API_URL}/v1/provisioning/tick`, { 
      method: 'POST',
      headers,
    });
    revalidatePath('/console');
    revalidatePath('/');
  } catch (error) {
    console.error(error);
  }
}

export async function redeployApplication(id: string, envVars?: Record<string, string>) {
  const headers = await getAuthHeaders({ 'Content-Type': 'application/json' });
  if (!headers) return { error: 'Unauthorized' };

  try {
    const res = await fetch(`${API_URL}/v1/applications/${id}/redeploy`, {
      method: 'POST',
      headers,
      body: JSON.stringify(envVars !== undefined ? { envVars } : {}),
    });

    if (!res.ok) {
      const error = await res.json().catch(() => ({}));
      return { error: error.message || 'Failed to trigger redeploy' };
    }

    const data = await res.json();
    revalidatePath('/console');
    revalidatePath('/');
    return { success: true, data };
  } catch (error) {
    return { error: 'Network error communicating with API' };
  }
}

export async function getApplicationEnvVars(id: string) {
  const headers = await getAuthHeaders();
  if (!headers) return { error: 'Unauthorized', envVars: {} };

  try {
    const res = await fetch(`${API_URL}/v1/applications/${id}/env`, {
      headers,
      cache: 'no-store',
    });

    if (!res.ok) {
      const error = await res.json().catch(() => ({}));
      return { error: error.message || 'Failed to get environment variables', envVars: {} };
    }

    const data = await res.json();
    return { success: true, envVars: data.envVars || {} };
  } catch (error) {
    return { error: 'Network error communicating with API', envVars: {} };
  }
}

export async function updateApplicationEnvVars(
  id: string,
  envVars: Record<string, string>,
  redeploy = true,
) {
  const headers = await getAuthHeaders({ 'Content-Type': 'application/json' });
  if (!headers) return { error: 'Unauthorized' };

  try {
    const res = await fetch(`${API_URL}/v1/applications/${id}/env`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ envVars, redeploy }),
    });

    if (!res.ok) {
      const error = await res.json().catch(() => ({}));
      return { error: error.message || 'Failed to update environment variables' };
    }

    const data = await res.json();
    revalidatePath('/console');
    revalidatePath('/');
    return { success: true, data };
  } catch (error) {
    return { error: 'Network error communicating with API' };
  }
}

export async function updateApplicationCustomDomain(
  id: string,
  customDomain: string | null,
) {
  const headers = await getAuthHeaders({ 'Content-Type': 'application/json' });
  if (!headers) return { error: 'Unauthorized' };

  try {
    const res = await fetch(`${API_URL}/v1/applications/${id}/domain`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ customDomain }),
    });

    if (!res.ok) {
      const error = await res.json().catch(() => ({}));
      return { error: error.message || 'Failed to update custom domain' };
    }

    const data = await res.json();
    revalidatePath('/console');
    revalidatePath('/');
    return { success: true, data };
  } catch (error) {
    return { error: 'Network error communicating with API' };
  }
}

export async function generateOpsInsight(applicationId?: string) {
  const headers = await getAuthHeaders({ 'Content-Type': 'application/json' });
  if (!headers) return { error: 'Unauthorized' };

  try {
    const payload: Record<string, string> = {};
    if (applicationId && applicationId !== 'all') {
      payload.applicationId = applicationId;
    }

    const res = await fetch(`${API_URL}/v1/ai/insights/ops`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });
    
    if (!res.ok) {
      const error = await res.json().catch(() => ({}));
      return { error: error.message || 'Failed to generate insight' };
    }
    
    return { data: await res.json() };
  } catch (error) {
    return { error: 'Network error' };
  }
}

export async function promptApplication(formData: FormData) {
  const headers = await getAuthHeaders({ 'Content-Type': 'application/json' });
  if (!headers) return { error: 'Unauthorized' };

  const prompt = formData.get('prompt') as string;
  const repositoryName = formData.get('repositoryName') as string | null;
  const repositoryDescription = formData.get('repositoryDescription') as string | null;
  const generateDescription = formData.get('generateDescriptionValue') === 'true';

  try {
    const res = await fetch(`${API_URL}/v1/ai/provision`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ prompt, repositoryName, repositoryDescription, generateDescription })
    });

    if (!res.ok) {
      const error = await res.json().catch(() => ({}));
      return { error: error.message || 'Failed to parse prompt' };
    }

    revalidatePath('/console');
    revalidatePath('/');
    return { success: true };
  } catch (error) {
    return { error: 'Network error communicating with API' };
  }
}

export async function iterateApplicationWithAi(appId: string, prompt: string) {
  const headers = await getAuthHeaders({ 'Content-Type': 'application/json' });
  if (!headers) return { error: 'Unauthorized' };

  try {
    const res = await fetch(`${API_URL}/v1/ai/applications/${appId}/iterate`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ prompt }),
    });

    if (!res.ok) {
      const error = await res.json().catch(() => ({}));
      return { error: error.message || 'Failed to iterate on application' };
    }

    const data = await res.json();
    revalidatePath('/console');
    revalidatePath('/');
    return { success: true, ...data };
  } catch (error) {
    return { error: 'Network error communicating with API' };
  }
}

export async function deleteApplication(id: string) {
  const headers = await getAuthHeaders();
  if (!headers) return { error: 'Unauthorized' };

  try {
    const res = await fetch(`${API_URL}/v1/applications/${id}`, {
      method: 'DELETE',
      headers,
    });

    if (!res.ok) {
      return { error: 'Failed to delete application' };
    }

    revalidatePath('/console');
    revalidatePath('/');
    return { success: true };
  } catch (error) {
    return { error: 'Network error communicating with API' };
  }
}

export async function getApplicationLogs(id: string) {
  const headers = await getAuthHeaders();
  if (!headers) return [];

  try {
    const res = await fetch(`${API_URL}/v1/applications/${id}/logs`, { 
      headers,
      cache: 'no-store' 
    })
    if (!res.ok) return []
    const logs = await res.json()
    return logs
  } catch (error) {
    console.error(error)
    return []
  }
}

export async function debugWithAi(id: string, logContent?: string) {
  const headers = await getAuthHeaders({ 'Content-Type': 'application/json' });
  if (!headers) return { error: 'Unauthorized' };

  try {
    const logSnippet = logContent?.trim()
      ? `My application deployment failed with the following log:\n\n${logContent}\n\nPlease explain what went wrong and how I can fix it.`
      : `My application deployment is currently in a failed state with no stdout logs captured. Please inspect its runtime, configuration, and source files to explain why it failed and how to recover it.`;

    const res = await fetch(`${API_URL}/v1/ai/insights/ops`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        applicationId: id,
        customPrompt: logSnippet,
      }),
    });

    if (!res.ok) {
      const error = await res.json().catch(() => ({}));
      return { error: error.message || 'Failed to analyze failure with AI' };
    }

    return { data: await res.json() };
  } catch (error) {
    return { error: 'Network error communicating with AI service' };
  }
}

export async function listApiKeys() {
  const headers = await getAuthHeaders();
  if (!headers) return [];

  try {
    const res = await fetch(`${API_URL}/v1/api-keys`, {
      headers,
      cache: 'no-store',
    });
    if (!res.ok) return [];
    return res.json();
  } catch (error) {
    console.error(error);
    return [];
  }
}

export async function createApiKey(name?: string) {
  const headers = await getAuthHeaders({ 'Content-Type': 'application/json' });
  if (!headers) return { error: 'Unauthorized' };

  try {
    const res = await fetch(`${API_URL}/v1/api-keys`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ name }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return { error: err.message || 'Failed to create API key' };
    }

    revalidatePath('/settings');
    return { data: await res.json() };
  } catch (error) {
    return { error: 'Failed to create API key' };
  }
}

export async function revokeApiKey(id: string) {
  const headers = await getAuthHeaders();
  if (!headers) return { error: 'Unauthorized' };

  try {
    const res = await fetch(`${API_URL}/v1/api-keys/${id}`, {
      method: 'DELETE',
      headers,
    });

    if (!res.ok) {
      return { error: 'Failed to revoke API key' };
    }

    revalidatePath('/settings');
    return { success: true };
  } catch (error) {
    return { error: 'Failed to revoke API key' };
  }
}
