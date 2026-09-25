import { Injectable } from '@nestjs/common';
import { ModelAdapter } from '../model-adapter';

@Injectable()
export class OpenAICompatibleAdapter implements ModelAdapter {
  async complete(request: { prompt: string; purpose: string; tenantId: string }) {
    const baseUrl = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
    const apiKey = process.env.OPENAI_API_KEY;
    let model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
    if (model === 'llama-3.1-8b-instant') {
      model = 'openai/gpt-oss-20b';
    }
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: request.prompt }],
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
}
