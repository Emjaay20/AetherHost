jest.mock('@nestjs/schedule', () => ({
  Cron: () => () => undefined,
  CronExpression: { EVERY_MINUTE: '* * * * *' },
}));
jest.mock('./spacefast-tenant.service', () => ({
  SpacefastTenantService: class SpacefastTenantService {},
}));

import { SpacefastOperationReconcilerService } from './spacefast-operation-reconciler.service';

describe('SpacefastOperationReconcilerService', () => {
  it('refreshes every pending provider operation without one failure stopping the batch', async () => {
    const prisma = {
      externalFrontendDeployment: {
        findMany: jest.fn().mockResolvedValue([
          { tenantId: 'tenant_a', applicationId: 'app_a' },
          { tenantId: 'tenant_b', applicationId: 'app_b' },
        ]),
      },
    };
    const tenantService = {
      refresh: jest
        .fn()
        .mockResolvedValueOnce({ status: 'published' })
        .mockRejectedValueOnce(new Error('provider unavailable')),
    };
    const service = new SpacefastOperationReconcilerService(
      prisma as any,
      tenantService as any,
    );

    await expect(service.reconcilePendingOperations()).resolves.toBeUndefined();
    expect(prisma.externalFrontendDeployment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          provider: 'spacefast',
          status: 'publishing',
          operationId: { not: null },
        },
        take: 100,
      }),
    );
    expect(tenantService.refresh).toHaveBeenCalledWith('tenant_a', 'app_a');
    expect(tenantService.refresh).toHaveBeenCalledWith('tenant_b', 'app_b');
  });
});
