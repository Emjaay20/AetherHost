export interface ModelAdapter {
  complete(request: { prompt: string; purpose: string; tenantId: string }): Promise<{
    output: string;
    model: string;
    promptTokens: number;
    completionTokens: number;
  }>;
  completeStream?(request: { prompt: string; purpose: string; tenantId: string }): AsyncGenerator<string, void, unknown>;
}
