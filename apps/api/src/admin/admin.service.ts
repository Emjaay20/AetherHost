import { Injectable, Optional } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { BillingService } from '../billing/billing.service';
import { EntitlementsService } from '../entitlements/entitlements.service';
import { AdminHealthService } from './admin-health.service';
import { AdminOverviewService } from './admin-overview.service';
import { AdminTenantService } from './admin-tenant.service';
import { AdminBillingService } from './admin-billing.service';

@Injectable()
export class AdminService {
  private readonly healthService: AdminHealthService;
  private readonly overviewService: AdminOverviewService;
  private readonly tenantService: AdminTenantService;
  private readonly adminBillingService: AdminBillingService;

  constructor(
    prisma: PrismaService,
    billing: BillingService,
    entitlements: EntitlementsService,
    @InjectQueue('webhooks') webhooks: Queue,
    @Optional() healthService?: AdminHealthService,
    @Optional() overviewService?: AdminOverviewService,
    @Optional() tenantService?: AdminTenantService,
    @Optional() adminBillingService?: AdminBillingService,
  ) {
    this.healthService =
      healthService ?? new AdminHealthService(prisma, webhooks);
    this.overviewService =
      overviewService ?? new AdminOverviewService(prisma, this.healthService);
    this.tenantService = tenantService ?? new AdminTenantService(prisma);
    this.adminBillingService =
      adminBillingService ??
      new AdminBillingService(prisma, billing, entitlements, webhooks);
  }

  overview() {
    return this.overviewService.overview();
  }

  getAnalytics() {
    return this.healthService.getAnalytics();
  }

  listTenants(query: { q?: string; skip: number; take: number }) {
    return this.tenantService.listTenants(query);
  }

  getTenant(id: string) {
    return this.tenantService.getTenant(id);
  }

  applyOperatorPlan(
    actorId: string,
    tenantId: string,
    planId: string,
    idempotencyKey?: string,
  ) {
    return this.adminBillingService.applyOperatorPlan(
      actorId,
      tenantId,
      planId,
      idempotencyKey,
    );
  }

  impersonateTenant(actorId: string, tenantId: string) {
    return this.tenantService.impersonateTenant(actorId, tenantId);
  }

  replayWebhooks(actorId: string, tenantId: string) {
    return this.adminBillingService.replayWebhooks(actorId, tenantId);
  }

  issueRefund(
    actorId: string,
    tenantId: string,
    amountDollars?: number,
    reason?: string,
  ) {
    return this.adminBillingService.issueRefund(
      actorId,
      tenantId,
      amountDollars,
      reason,
    );
  }

  suspendTenant(actorId: string, tenantId: string, reason?: string) {
    return this.tenantService.suspendTenant(actorId, tenantId, reason);
  }

  unsuspendTenant(actorId: string, tenantId: string) {
    return this.tenantService.unsuspendTenant(actorId, tenantId);
  }

  syncDirectory(actorId: string) {
    return this.tenantService.syncDirectory(actorId);
  }
}
