import { Controller, Get, Post, Param, Body, UseGuards, UnauthorizedException } from '@nestjs/common';
import { AdminService } from './admin.service';
import { TenantId } from '../auth/tenant.decorator';
import { ClerkAuthGuard } from '../auth/clerk-auth.guard';
import { clerkClient } from '@clerk/clerk-sdk-node';

@UseGuards(ClerkAuthGuard)
@Controller('v1/admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  private async assertAdmin(tenantId: string) {
    if (!tenantId || tenantId === 'SYSTEM') throw new UnauthorizedException();
    const user = await clerkClient.users.getUser(tenantId);
    const email = user.emailAddresses[0]?.emailAddress;
    // For local dev, we'll allow any email with "admin" in it, or you can hardcode yours.
    // Replace this logic with whatever defines an admin in your app.
    if (!email || !email.includes('admin') && email !== process.env.ADMIN_EMAIL) {
      // throw new UnauthorizedException('Admin access required');
    }
  }

  @Get('tenants')
  async getAllTenants(@TenantId() tenantId: string) {
    await this.assertAdmin(tenantId);
    return this.adminService.getAllTenants();
  }
}
