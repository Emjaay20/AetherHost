import { Injectable } from '@nestjs/common';
import { ModelAdapter } from '../model-adapter';

@Injectable()
export class OpenAICompatibleAdapter implements ModelAdapter {
  private routeModel(purpose: string) {
    if (purpose === 'insight' || purpose === 'simple') {
      return 'llama3-8b-8192'; // Fast/cheap routing
    }
    return process.env.OPENAI_MODEL || 'llama3-70b-8192'; // Powerful routing
  }

  async complete(request: { prompt: string; purpose: string; tenantId: string }) {
    const baseUrl = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
    const apiKey = process.env.OPENAI_API_KEY;
    const model = this.routeModel(request.purpose);
    
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: request.prompt }],
        max_tokens: 4000,
        temperature: 0.2,
      })
    });

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`Provider error: ${errorText}`);
    }

    const data = await res.json();
    return {
      output: data.choices?.[0]?.message?.content || '',
      model: data.model || model,
      promptTokens: data.usage?.prompt_tokens || 0,
      completionTokens: data.usage?.completion_tokens || 0,
    };
  }

  async *completeStream(request: { prompt: string; purpose: string; tenantId: string }) {
    const baseUrl = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
    const apiKey = process.env.OPENAI_API_KEY;
    const model = this.routeModel(request.purpose);
    
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: request.prompt }],
        max_tokens: 4000,
        temperature: 0.2,
        stream: true,
      })
    });

    if (!res.ok || !res.body) throw new Error('Provider error or missing body');

    const decoder = new TextDecoder();
    const reader = res.body.getReader();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]') break;
          try {
            const parsed = JSON.parse(data);
            const text = parsed.choices[0]?.delta?.content || '';
            if (text) yield text;
          } catch (e) {
            // ignore JSON parse errors for incomplete chunks
          }
        }
      }
    }
  }
}
