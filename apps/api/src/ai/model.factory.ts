import { Injectable } from '@nestjs/common';
import { ModelAdapter } from './model-adapter';
import { StubModelAdapter } from './adapters/stub.adapter';
import { OpenAICompatibleAdapter } from './adapters/openai.adapter';

@Injectable()
export class ModelFactory {
  constructor(
    private readonly stub: StubModelAdapter,
    private readonly openai: OpenAICompatibleAdapter,
  ) {}

  get(): ModelAdapter {
    const provider = process.env.AI_PROVIDER || 'stub';
    const hasKey = !!process.env.OPENAI_API_KEY;
    
    if (provider === 'openai' && hasKey) {
      return this.openai;
    }
    
    return this.stub;
  }
}
