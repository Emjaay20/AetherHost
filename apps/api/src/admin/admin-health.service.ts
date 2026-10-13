import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { asNumber, monthKey } from './admin.metrics';

@Injectable()
export class AdminHealthService {
  private readonly logger = new Logger(AdminHealthService.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue('webhooks') private readonly webhooks: Queue,
  ) {}

  async getAnalytics() {
    const analytics = await this.analytics();
    return {
      available: analytics.available,
      error: analytics.error,
      mrrByMonth: analytics.mrrByMonth,
      cohorts: analytics.cohorts,
      aiUsage: analytics.aiUsage,
      recognizedMrrDollars: analytics.recognizedDollars,
      recognizedMonth: analytics.recognizedMonth,
    };
  }

  async analytics() {
    const recognizedMonth = new Date().toISOString().slice(0, 7);
    try {
      const [mrr, cohorts, aiUsage] = await Promise.all([
        this.prisma.$queryRaw<
          Array<{ month: Date | string; total_mrr_cent: unknown }>
        >`SELECT month, total_mrr_cent FROM analytics_mrr ORDER BY 1 ASC`,
        this.prisma.$queryRaw<
          Array<{ cohort_month: Date | string; new_tenants: unknown }>
        >`SELECT cohort_month, new_tenants FROM analytics_tenant_cohorts ORDER BY 1 DESC`,
        this.prisma.$queryRaw<
          Array<{
            tenantId: string;
            total_requests: unknown;
            total_tokens: unknown;
          }>
        >`SELECT "tenantId", total_requests, total_tokens FROM analytics_ai_usage_trends ORDER BY 2 DESC LIMIT 8`,
      ]);
      const mrrByMonth = mrr
        .map((row) => ({
          month: monthKey(row.month),
          dollars: asNumber(row.total_mrr_cent) / 100,
        }))
        .filter((row) => row.month);
      return {
        available: true as const,
        error: undefined as string | undefined,
        recognizedMonth,
        recognizedDollars:
          mrrByMonth.find((row) => row.month === recognizedMonth)?.dollars ?? 0,
        mrrByMonth,
        cohorts: cohorts.map((row) => ({
          month: monthKey(row.cohort_month),
          newTenants: asNumber(row.new_tenants),
        })),
        aiUsage: aiUsage.map((row) => ({
          tenantId: row.tenantId,
          requests: asNumber(row.total_requests),
          tokens: asNumber(row.total_tokens),
        })),
      };
    } catch (error) {
      this.logger.warn(
        `Analytics views unavailable: ${error instanceof Error ? error.message : 'unknown'}`,
      );
      return {
        available: false as const,
        error: 'analytics views unavailable',
        recognizedMonth,
        recognizedDollars: 0,
        mrrByMonth: [],
        cohorts: [],
        aiUsage: [],
      };
    }
  }

  async queueHealth() {
    try {
      const counts = await withTimeout(this.webhooks.getJobCounts(), 800);
      return {
        available: true,
        counts: {
          waiting: counts.waiting ?? 0,
          active: counts.active ?? 0,
          completed: counts.completed ?? 0,
          failed: counts.failed ?? 0,
          delayed: counts.delayed ?? 0,
          paused: counts.paused ?? 0,
        },
      };
    } catch (error) {
      return {
        available: false,
        error: error instanceof Error ? error.message : 'unavailable',
        counts: null,
      };
    }
  }

  async postgres() {
    try {
      await withTimeout(this.prisma.$queryRaw`SELECT 1`, 800);
      return 'ok' as const;
    } catch {
      return 'fail' as const;
    }
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error instanceof Error ? error : new Error('timeout'));
      },
    );
  });
}
