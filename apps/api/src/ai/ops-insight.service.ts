import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AiProxyService } from './ai-proxy.service';

@Injectable()
export class OpsInsightService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly aiProxy: AiProxyService,
  ) {}

  async generate(tenantId: string) {
    // 1. Read up to 20 apps and 30 events
    const apps = await this.prisma.application.findMany({
      where: { tenantId },
      take: 20,
    });
    const events = await this.prisma.domainEventRecord.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      take: 30,
    });

    // 2. Build snapshot
    const eventNames = Array.from(new Set(events.map(e => e.eventName)));
    const snapshot = {
      apps: apps.map(a => ({ name: a.name, runtime: a.runtime, status: a.status })),
      events: events.map(e => ({ name: e.eventName, payload: e.payload })),
    };

    const prompt = `Analyze this ops snapshot and provide a short briefing:\n${JSON.stringify(snapshot)}`;

    // 3. Call proxy
    const completion = await this.aiProxy.complete(tenantId, prompt, 'ops_insight');

    // 4. Return formatted response
    return {
      tenantId,
      insight: completion.output,
      model: completion.model,
      costUsd: completion.costUsd,
      sources: {
        applicationCount: apps.length,
        eventCount: events.length,
        eventNames,
      }
    };
  }
}
