import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Logger,
  NotFoundException,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { CustomerSuccessService } from './customer-success.service';
import { SalesforceService } from '../integrations/salesforce/salesforce.service';
import { ClerkAuthGuard } from '../auth/clerk-auth.guard';
import { ActorTenantId } from '../auth/tenant.decorator';

@Controller('v1/customer-success')
@UseGuards(ClerkAuthGuard)
export class CustomerSuccessController {
  private readonly logger = new Logger(CustomerSuccessController.name);

  constructor(
    private readonly csService: CustomerSuccessService,
    private readonly sfdcService: SalesforceService,
  ) {}

  private checkAdmin(actorId: string) {
    const admins = (process.env.ADMIN_TENANT_IDS || '')
      .split(',')
      .map((id) => id.trim())
      .filter((id) => id.length > 0);
    if (!admins.includes(actorId)) {
      this.logger.warn(
        `Customer Success access denied for actorId: "${actorId}". Allowed admins: ${admins.length}`,
      );
      throw new UnauthorizedException('Operator administrator access required');
    }
  }

  @Get('portfolio')
  async getPortfolio(@ActorTenantId() actorId: string) {
    this.checkAdmin(actorId);
    return await this.csService.getPortfolioSummary();
  }

  @Get('accounts/:id')
  async getAccount(@ActorTenantId() actorId: string, @Param('id') id: string) {
    this.checkAdmin(actorId);
    const account = await this.csService.getAccount(id);
    if (!account) throw new NotFoundException(`Tenant ${id} not found`);
    return account;
  }

  @Post('accounts/:id/sync-sfdc')
  async syncToSalesforce(
    @ActorTenantId() actorId: string,
    @Param('id') id: string,
  ) {
    this.checkAdmin(actorId);
    return await this.csService.syncAccountToSalesforce(id);
  }

  @Post('accounts/:id/flag-expansion')
  async flagExpansion(
    @ActorTenantId() actorId: string,
    @Param('id') id: string,
    @Body() body: { potentialARR?: number },
  ) {
    this.checkAdmin(actorId);
    const account = await this.csService.getAccount(id);
    if (!account) throw new NotFoundException(`Tenant ${id} not found`);

    const amount = body.potentialARR || (account.plan === 'ENTERPRISE' ? 45000 : 18000);

    const sfdcOpp = await this.sfdcService.createExpansionOpportunity({
      AccountId: account.sfdcAccountId || account.id,
      Name: `${account.name} - Quota Expansion (${account.quotaUtilizationPercent}% Utilization)`,
      StageName: 'Qualification',
      Amount: amount,
      CloseDate: new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
      Type: 'Existing Customer - Upgrade',
      Description: `Customer Success handoff: Tenant ${account.name} (${account.id}) reached ${account.quotaUtilizationPercent}% compute quota with ${account.activeWorkloads} active workloads.`,
    });

    return {
      success: sfdcOpp.success,
      accountName: account.name,
      opportunity: sfdcOpp,
      message: sfdcOpp.success
        ? 'Expansion opportunity pushed to live Salesforce Account Executive pipeline.'
        : sfdcOpp.message || 'Salesforce unconfigured.',
    };
  }
}
