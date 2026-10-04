import { Controller, Get, UseGuards, UnauthorizedException } from '@nestjs/common';
import { ClerkAuthGuard } from '../auth/clerk-auth.guard';
import { AdminService } from './admin.service';
import { TenantId } from '../auth/tenant.decorator';

@Controller('v1/admin')
@UseGuards(ClerkAuthGuard)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  private checkAdmin(tenantId: string) {
    const admins = (process.env.ADMIN_TENANT_IDS || '').split(',');
    if (!admins.includes(tenantId)) {
      throw new UnauthorizedException('Admin access restricted');
    }
  }

  @Get('tenants')
  async getTenants(@TenantId() tenantId: string) {
    this.checkAdmin(tenantId);
    return this.adminService.getAllTenants();
  }

  @Get('analytics')
  async getAnalytics(@TenantId() tenantId: string) {
    this.checkAdmin(tenantId);
    return this.adminService.getAnalytics();
  }
}
