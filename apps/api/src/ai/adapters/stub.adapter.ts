import { Injectable } from '@nestjs/common';
import { ModelAdapter } from '../model-adapter';

@Injectable()
export class StubModelAdapter implements ModelAdapter {
  async complete(request: { prompt: string; purpose: string; tenantId: string }) {
    const output = `[AetherHost stub:${request.purpose}] A simulated response for: "${request.prompt}"`;
    return {
      output,
      model: 'aetherhost-stub-v1',
      promptTokens: request.prompt.length,
      completionTokens: output.length,
    };
  }
}
