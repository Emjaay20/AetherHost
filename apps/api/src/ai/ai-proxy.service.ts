import { Injectable, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EntitlementsService } from '../entitlements/entitlements.service';
import { DomainEventsService } from '../events/domain-events.service';
import { AIRequestCompleted } from '@aetherhost/domain';
import { slugify } from '@aetherhost/common';

import { ModelFactory } from './model.factory';

@Injectable()
export class AiProxyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly entitlements: EntitlementsService,
    private readonly events: DomainEventsService,
    private readonly models: ModelFactory,
  ) {}

  async complete(tenantId: string, prompt: string, purpose: string, applicationId?: string) {
    // 1. Authorize (before consuming quota)
    const decision = await this.entitlements.canAiRequest(tenantId);
    if (!decision.allowed) {
      throw new ForbiddenException('AI request quota exhausted');
    }

    // 2. Call adapter
    const start = Date.now();
    const result = await this.models.get().complete({
      tenantId,
      prompt,
      purpose,
    });
    const latencyMs = Date.now() - start;

    return this.prisma.$transaction(async (tx) => {
      // 3. Meter (consume quota on success)
      const allowed = await this.entitlements.consumeAiRequestSlot(tenantId, result.promptTokens + result.completionTokens, tx);
      if (!allowed) {
        throw new ForbiddenException('AI request quota exhausted during processing');
      }

      const id = `ai_${slugify(purpose)}_${Math.random().toString(36).substring(2, 7)}`;
      const costUsd = (result.promptTokens + result.completionTokens) * 0.000002;
      
      const response = {
        id,
        model: result.model,
        output: result.output,
        usage: { promptTokens: result.promptTokens, completionTokens: result.completionTokens },
        costUsd,
        latencyMs,
      };

      // 4. Emit Domain Event
      await this.events.publish(
        new AIRequestCompleted(tenantId, applicationId, response),
        tx
      );

      return response;
    });
  }
}
