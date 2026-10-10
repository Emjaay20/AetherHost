import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ClerkAuthGuard } from '../auth/clerk-auth.guard';
import { AdminService } from './admin.service';
import { ActorTenantId } from '../auth/tenant.decorator';
import { ApplyPlanDto } from './dto/apply-plan.dto';
import { RefundDto } from './dto/refund.dto';
import { SuspendDto } from './dto/suspend.dto';

@Controller('v1/admin')
@UseGuards(ClerkAuthGuard)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  private checkAdmin(actorId: string) {
    const admins = (process.env.ADMIN_TENANT_IDS || '')
      .split(',')
      .map((id) => id.trim())
      .filter((id) => id.length > 0);
    if (!admins.includes(actorId)) {
      console.log(`[AdminController] Access denied for actorId: "${actorId}". Allowed:`, admins);
      throw new UnauthorizedException('Admin access restricted');
    }
  }

  @Get('overview')
  async overview(@ActorTenantId() actorId: string) {
    this.checkAdmin(actorId);
    return this.adminService.overview();
  }

  @Get('analytics')
  async getAnalytics(@ActorTenantId() actorId: string) {
    this.checkAdmin(actorId);
    return this.adminService.getAnalytics();
  }

  @Get('tenants')
  async getTenants(
    @ActorTenantId() actorId: string,
    @Query('q') q?: string,
    @Query('skip') skip?: string,
    @Query('take') take?: string,
  ) {
    this.checkAdmin(actorId);
    return this.adminService.listTenants({
      q: q?.trim().slice(0, 80) || undefined,
      skip: clamp(Number(skip) || 0, 0, 5000),
      take: clamp(Number(take) || 20, 1, 50),
    });
  }

  @Post('directory/sync')
  async syncDirectory(@ActorTenantId() actorId: string) {
    this.checkAdmin(actorId);
    return this.adminService.syncDirectory(actorId);
  }

  @Get('tenants/:id')
  async getTenant(@ActorTenantId() actorId: string, @Param('id') id: string) {
    this.checkAdmin(actorId);
    return this.adminService.getTenant(id);
  }

  @Post('tenants/:id/plan')
  async applyPlan(
    @ActorTenantId() actorId: string,
    @Param('id') id: string,
    @Body() body: ApplyPlanDto,
  ) {
    this.checkAdmin(actorId);
    return this.adminService.applyOperatorPlan(
      actorId,
      id,
      body.planId,
      body.idempotencyKey,
    );
  }

  @Post('tenants/:id/impersonate')
  async impersonateTenant(
    @ActorTenantId() actorId: string,
    @Param('id') id: string,
  ) {
    this.checkAdmin(actorId);
    return this.adminService.impersonateTenant(actorId, id);
  }

  @Post('tenants/:id/replay-webhooks')
  async replayWebhooks(
    @ActorTenantId() actorId: string,
    @Param('id') id: string,
  ) {
    this.checkAdmin(actorId);
    return this.adminService.replayWebhooks(actorId, id);
  }

  @Post('tenants/:id/refund')
  async issueRefund(
    @ActorTenantId() actorId: string,
    @Param('id') id: string,
    @Body() body?: RefundDto,
  ) {
    this.checkAdmin(actorId);
    return this.adminService.issueRefund(actorId, id, body?.amountDollars, body?.reason);
  }

  @Post('tenants/:id/suspend')
  async suspendTenant(
    @ActorTenantId() actorId: string,
    @Param('id') id: string,
    @Body() body?: SuspendDto,
  ) {
    this.checkAdmin(actorId);
    return this.adminService.suspendTenant(actorId, id, body?.reason);
  }

  @Post('tenants/:id/unsuspend')
  async unsuspendTenant(
    @ActorTenantId() actorId: string,
    @Param('id') id: string,
  ) {
    this.checkAdmin(actorId);
    return this.adminService.unsuspendTenant(actorId, id);
  }
}

function clamp(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.floor(value)));
}
