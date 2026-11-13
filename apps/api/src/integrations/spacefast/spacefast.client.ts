export type SpacefastFetch = typeof fetch;

export type SpacefastSpace = {
  id: string;
  slug: string;
  liveUrl?: string | null;
};

export type SpacefastOperation = {
  id: string;
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'canceled' | string;
  kind?: string;
};

export type SpacefastPublishReceipt = {
  space: SpacefastSpace;
  version: { id: string; status: string; immutableUrl?: string | null };
  operation?: SpacefastOperation | null;
  next?: { action: 'poll' | 'done'; url?: string; retryAfter?: number };
};

export class SpacefastApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly requestId?: string,
    readonly code?: string,
  ) {
    super(message);
    this.name = 'SpacefastApiError';
  }
}

// SpacefastClient is deliberately an adapter, not a deployment default. The
// control plane only constructs it when an operator explicitly enables the
// integration with a scoped server-side credential. It never shells out to a
// CLI and never receives a tenant's Spacefast token.
export class SpacefastClient {
  constructor(
    private readonly apiKey: string,
    private readonly fetchFn: SpacefastFetch = fetch,
    private readonly baseUrl = 'https://api.spacefast.com',
  ) {
    if (!apiKey.startsWith('sfa_')) {
      throw new Error('Spacefast API key is missing or has an unsupported prefix');
    }
    if (!baseUrl.startsWith('https://')) {
      throw new Error('Spacefast API base URL must use HTTPS');
    }
  }

  static fromEnvironment(env = process.env): SpacefastClient | null {
    if (env.SPACEFAST_ENABLED !== 'true') {
      return null;
    }
    const apiKey = env.SPACEFAST_API_KEY?.trim();
    if (!apiKey) {
      throw new Error('SPACEFAST_ENABLED requires SPACEFAST_API_KEY');
    }
    return new SpacefastClient(apiKey, fetch, env.SPACEFAST_API_BASE_URL?.trim() || undefined);
  }

  async createPrivateSpace(input: {
    teamId: string;
    slug: string;
    title: string;
    idempotencyKey: string;
  }): Promise<SpacefastSpace> {
    const response = await this.request('/v1/spaces', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'idempotency-key': input.idempotencyKey,
      },
      body: JSON.stringify({
        teamId: input.teamId,
        slug: input.slug,
        title: input.title,
        access: 'private',
      }),
    });
    const payload = await this.parse<{ data: { space: SpacefastSpace } }>(response);
    return payload.data.space;
  }

  // The artifact is supplied by an explicit build pipeline. AetherHost never
  // guesses a repository root, replaces tenant source, or publishes a running
  // backend as a frontend artifact.
  async publishArchive(input: {
    spaceId: string;
    archive: Blob;
    fileName: string;
    idempotencyKey: string;
  }): Promise<SpacefastPublishReceipt> {
    const body = new FormData();
    body.set('spaceId', input.spaceId);
    body.set('files', input.archive, input.fileName);
    const response = await this.request('/v1/publish?async=1', {
      method: 'POST',
      headers: { 'idempotency-key': input.idempotencyKey },
      body,
    });
    return (await this.parse<{ data: SpacefastPublishReceipt }>(response)).data;
  }

  async getOperation(operationId: string): Promise<SpacefastOperation> {
    const response = await this.request(`/v1/operations/${encodeURIComponent(operationId)}`, {
      method: 'GET',
    });
    return (await this.parse<{ data: SpacefastOperation }>(response)).data;
  }

  private async request(path: string, init: RequestInit): Promise<Response> {
    const headers = new Headers(init.headers);
    headers.set('authorization', `Bearer ${this.apiKey}`);
    headers.set('accept', 'application/json');
    const response = await this.fetchFn(`${this.baseUrl}${path}`, { ...init, headers });
    if (!response.ok) {
      const requestId = response.headers.get('x-request-id') || undefined;
      let details: { detail?: string; title?: string; code?: string } | undefined;
      try {
        details = await response.json();
      } catch {
        // Keep the caller-safe status/request ID even if an intermediary sent HTML.
      }
      throw new SpacefastApiError(
        details?.detail || details?.title || `Spacefast request failed with ${response.status}`,
        response.status,
        requestId,
        details?.code,
      );
    }
    return response;
  }

  private async parse<T>(response: Response): Promise<T> {
    try {
      return (await response.json()) as T;
    } catch {
      throw new SpacefastApiError(
        'Spacefast returned an invalid JSON response',
        response.status,
        response.headers.get('x-request-id') || undefined,
      );
    }
  }
}
