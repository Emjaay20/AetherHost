import { Injectable, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EntitlementsService } from '../entitlements/entitlements.service';
import { DomainEventsService } from '../events/domain-events.service';
import { AIRequestCompleted } from '@aetherhost/domain';
import { slugify } from '@aetherhost/common';
import { Observable } from 'rxjs';

import { ModelFactory } from './model.factory';

@Injectable()
export class AiProxyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly entitlements: EntitlementsService,
    private readonly events: DomainEventsService,
    private readonly models: ModelFactory,
  ) {}

  private applyGuardrails(prompt: string) {
    if (prompt.length > 50000) {
      throw new BadRequestException('Prompt exceeds maximum length of 50,000 characters.');
    }
    // Basic PII or harmful content guardrails could go here
    if (/social security number|credit card/i.test(prompt)) {
      throw new BadRequestException('Prompt failed safety guardrails (PII detected).');
    }
  }

  async complete(tenantId: string, prompt: string, purpose: string, applicationId?: string) {
    this.applyGuardrails(prompt);

    const allowed = await this.entitlements.consumeAiRequestSlot(tenantId, 0);
    if (!allowed) throw new ForbiddenException('AI request quota exhausted');

    const start = Date.now();
    const result = await this.models.get().complete({ tenantId, prompt, purpose });
    const latencyMs = Date.now() - start;
    
    // Some models don't return prompt/completion tokens, so we backfill using tiktoken if they are 0
    let { promptTokens, completionTokens } = result;
    if (promptTokens === 0 && completionTokens === 0) {
      const { getEncoding } = require('js-tiktoken');
      const enc = getEncoding("cl100k_base");
      promptTokens = enc.encode(prompt).length;
      completionTokens = enc.encode(result.output).length;
    }

    return this.prisma.$transaction(async (tx) => {
      await this.entitlements.recordAiTokenUsage(tenantId, promptTokens + completionTokens, tx);

      const id = `ai_${slugify(purpose)}_${Math.random().toString(36).substring(2, 7)}`;
      const costUsd = (promptTokens + completionTokens) * 0.000002;
      
      const response = { id, model: result.model, output: result.output, usage: { promptTokens, completionTokens }, costUsd, latencyMs };
      await this.events.publish(new AIRequestCompleted(tenantId, applicationId, response), tx);
      return response;
    });
  }

  completeStream(tenantId: string, prompt: string, purpose: string, applicationId?: string): Observable<MessageEvent> {
    this.applyGuardrails(prompt);

    return new Observable((subscriber) => {
      this.entitlements.consumeAiRequestSlot(tenantId, 0).then((allowed) => {
        if (!allowed) {
          subscriber.error(new ForbiddenException('AI request quota exhausted'));
          return;
        }

        const modelAdapter = this.models.get();
        if (!modelAdapter.completeStream) {
          subscriber.error(new BadRequestException('Model provider does not support streaming'));
          return;
        }

        (async () => {
          let outputAccumulator = '';
          try {
            const stream = modelAdapter.completeStream!({ tenantId, prompt, purpose });
            for await (const chunk of stream) {
              outputAccumulator += chunk;
              subscriber.next({ data: chunk } as MessageEvent);
            }
            // Emit usage domain event asynchronously after completion
            const { getEncoding } = require('js-tiktoken');
            const enc = getEncoding("cl100k_base");
            const promptTokens = enc.encode(prompt).length;
            const completionTokens = enc.encode(outputAccumulator).length;
            const estimatedTokens = promptTokens + completionTokens;
            await this.prisma.$transaction(async (tx) => {
              await this.entitlements.recordAiTokenUsage(tenantId, estimatedTokens, tx);
              await this.events.publish(new AIRequestCompleted(tenantId, applicationId, {
                id: `ai_${slugify(purpose)}_${Math.random().toString(36).substring(2, 7)}`,
                model: 'streamed',
                output: outputAccumulator,
                usage: { promptTokens, completionTokens },
                costUsd: estimatedTokens * 0.000002,
                latencyMs: 0
              }), tx);
            });
            subscriber.complete();
          } catch (e) {
            subscriber.error(e);
          }
        })();
      });
    });
  }
}
