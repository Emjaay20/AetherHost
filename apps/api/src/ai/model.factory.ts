import { Injectable, Logger } from '@nestjs/common';
import { ModelAdapter } from './model-adapter';
import { StubModelAdapter } from './adapters/stub.adapter';
import { OpenAICompatibleAdapter } from './adapters/openai.adapter';

@Injectable()
export class ModelFactory {
  private readonly logger = new Logger(ModelFactory.name);

  constructor(
    private readonly stub: StubModelAdapter,
    private readonly openai: OpenAICompatibleAdapter,
  ) {}

  get(): ModelAdapter {
    const provider = process.env.AI_PROVIDER || 'stub';
    const hasKey = !!process.env.OPENAI_API_KEY;
    const baseUrl = process.env.OPENAI_BASE_URL;
    
    if (provider === 'openai' && hasKey) {
      if (baseUrl?.includes('groq')) {
         this.logger.log('Active LLM Provider: Groq (via OpenAI adapter interface)');
      } else {
         this.logger.log('Active LLM Provider: OpenAI (or compatible API)');
      }
      return this.openai;
    }
    
    this.logger.warn('No API key found or provider=stub. Falling back to StubModelAdapter.');
    return this.stub;
  }
}
