import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { SpacefastTenantService } from './spacefast-tenant.service';

const PROVIDER = 'spacefast';
const BATCH_SIZE = 100;

/**
 * Provider publishing is asynchronous. Reconcile it on the server so a tenant
 * does not have to keep a browser open or manually press Refresh status.
 */
@Injectable()
export class SpacefastOperationReconcilerService {
  private readonly logger = new Logger(
    SpacefastOperationReconcilerService.name,
  );

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantService: SpacefastTenantService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async reconcilePendingOperations() {
    // A publish interrupted before Spacefast returned an operation has nothing
    // to poll. Fail it after its lease so the tenant can see it and retry.
    try {
      const expired = await this.tenantService.expireAbandonedPublishes();
      if (expired > 0) {
        this.logger.warn(`Marked ${expired} interrupted Spacefast publish(es) as failed`);
      }
    } catch (error) {
      this.logger.warn(
        `Spacefast abandoned-publish sweep deferred (${safeErrorCode(error)})`,
      );
    }

    const deployments = await this.prisma.externalFrontendDeployment.findMany({
      where: {
        provider: PROVIDER,
        status: 'publishing',
        operationId: { not: null },
      },
      select: { tenantId: true, applicationId: true },
      orderBy: { updatedAt: 'asc' },
      take: BATCH_SIZE,
    });

    await Promise.allSettled(
      deployments.map(async (deployment) => {
        try {
          await this.tenantService.refresh(
            deployment.tenantId,
            deployment.applicationId,
          );
        } catch (error) {
          // A provider outage must not interrupt reconciliation for every other
          // tenant. Do not log a provider response here: it can contain URLs or
          // other tenant-specific data and the affected deployment will be
          // retried on the next run.
          this.logger.warn(
            `Spacefast reconciliation deferred for ${deployment.applicationId} (${safeErrorCode(error)})`,
          );
        }
      }),
    );
  }
}

function safeErrorCode(error: unknown) {
  if (error && typeof error === 'object' && 'code' in error) {
    const code = (error as { code: unknown }).code;
    if (typeof code === 'string' && /^[a-z0-9_-]{1,64}$/i.test(code)) {
      return code;
    }
  }

  return 'provider_error';
}
