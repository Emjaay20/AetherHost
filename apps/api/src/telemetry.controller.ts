import {
  Controller,
  Post,
  Body,
  Headers,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from './prisma/prisma.service';

@Controller('v1/telemetry')
export class TelemetryController {
  constructor(private readonly prisma: PrismaService) {}

  @Post()
  async reportMetrics(
    @Headers('x-agent-key') agentKey: string,
    @Body()
    body: { metrics: Array<{ applicationName: string; memoryMb: number }> },
  ) {
    const expected = process.env.AGENT_SECRET_KEY;
    if (!expected || agentKey !== expected) {
      throw new UnauthorizedException('Invalid agent key');
    }

    const apps = await this.prisma.application.findMany();
    const tenantMemory = new Map<string, number>();

    for (const metric of body.metrics) {
      const app = apps.find(
        (a) =>
          a.name.toLowerCase().replace(/ /g, '-') === metric.applicationName,
      );
      if (app) {
        const current = tenantMemory.get(app.tenantId) || 0;
        tenantMemory.set(app.tenantId, current + metric.memoryMb);
      }
    }

    for (const [tenantId, totalMb] of tenantMemory.entries()) {
      await this.prisma.tenantEntitlement
        .update({
          where: { tenantId },
          data: { currentMemoryMb: totalMb },
        })
        .catch(() => {});
    }

    return { success: true };
  }
}
