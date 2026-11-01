import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  NotFoundException,
  UseGuards,
} from '@nestjs/common';
import { CustomerSuccessService } from './customer-success.service';
import { SalesforceService } from '../integrations/salesforce/salesforce.service';
import { ClerkAuthGuard } from '../auth/clerk-auth.guard';

@Controller('v1/customer-success')
export class CustomerSuccessController {
  constructor(
    private readonly csService: CustomerSuccessService,
    private readonly sfdcService: SalesforceService
  ) {}

  @Get('portfolio')
  @UseGuards(ClerkAuthGuard)
  async getPortfolio() {
    return await this.csService.getPortfolioSummary();
  }

  @Get('accounts/:id')
  @UseGuards(ClerkAuthGuard)
  async getAccount(@Param('id') id: string) {
    const account = await this.csService.getAccount(id);
    if (!account) throw new NotFoundException(`Tenant ${id} not found`);
    return account;
  }

  @Post('accounts/:id/sync-sfdc')
  @UseGuards(ClerkAuthGuard)
  async syncToSalesforce(@Param('id') id: string) {
    return await this.csService.syncAccountToSalesforce(id);
  }

  @Post('accounts/:id/flag-expansion')
  @UseGuards(ClerkAuthGuard)
  async flagExpansion(
    @Param('id') id: string,
    @Body() body: { potentialARR?: number }
  ) {
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
