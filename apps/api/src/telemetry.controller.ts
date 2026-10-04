import {
  Controller,
  Post,
  Body,
  Headers,
  UnauthorizedException,
} from '@nestjs/common';
import { timingSafeEqual } from 'crypto';
import { PrismaService } from './prisma/prisma.service';

function safeCompare(a: string, b: string): boolean {
  try {
    return timingSafeEqual(Buffer.from(a), Buffer.from(b));
  } catch {
    return false;
  }
}

@Controller('v1/telemetry')
export class TelemetryController {
  constructor(private readonly prisma: PrismaService) {}

  @Post()
  async reportMetrics(
    @Headers('x-agent-key') agentKey: string,
    @Body()
    body: { metrics: Array<{ applicationName: string; memoryMb: number; storageMb: number }> },
  ) {
    const expected = process.env.AGENT_SECRET_KEY;
    if (!expected || !safeCompare(agentKey, expected)) {
      throw new UnauthorizedException('Invalid agent key');
    }

    const apps = await this.prisma.application.findMany();
    const tenantMemory = new Map<string, number>();
    const tenantStorage = new Map<string, number>();

    for (const metric of body.metrics) {
      const app = apps.find(
        (a) =>
          a.name.toLowerCase().replace(/ /g, '-') === metric.applicationName,
      );
      if (app) {
        const currentMem = tenantMemory.get(app.tenantId) || 0;
        tenantMemory.set(app.tenantId, currentMem + metric.memoryMb);
        
        const currentStore = tenantStorage.get(app.tenantId) || 0;
        tenantStorage.set(app.tenantId, currentStore + metric.storageMb);
      }
    }

    for (const [tenantId, totalMb] of tenantMemory.entries()) {
      await this.prisma.tenantEntitlement
        .update({
          where: { tenantId },
          data: { 
            currentMemoryMb: totalMb,
            usageStorageMb: tenantStorage.get(tenantId) || 0
          },
        })
        .catch(() => {});
    }

    return { success: true };
  }
}
