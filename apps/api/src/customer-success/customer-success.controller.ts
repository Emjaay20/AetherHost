import { Controller, Get, Post, Param, Query, Body, NotFoundException } from '@nestjs/common';
import { CustomerSuccessService } from './customer-success.service';
import { SalesforceService } from '../integrations/salesforce/salesforce.service';

@Controller('v1/customer-success')
export class CustomerSuccessController {
  constructor(
    private readonly csService: CustomerSuccessService,
    private readonly sfdcService: SalesforceService
  ) {}

  @Get('portfolio')
  getPortfolio(@Query('region') region?: string) {
    return this.csService.getPortfolioSummary(region || 'EMEA');
  }

  @Get('accounts/:id')
  getAccount(@Param('id') id: string) {
    const account = this.csService.getAccount(id);
    if (!account) throw new NotFoundException(`Account ${id} not found`);
    return account;
  }

  @Post('accounts/:id/sync-sfdc')
  async syncToSalesforce(@Param('id') id: string) {
    return await this.csService.syncAccountToSalesforce(id);
  }

  @Post('accounts/:id/flag-expansion')
  async flagExpansion(
    @Param('id') id: string,
    @Body() body: { estimatedSeats?: number; potentialARR?: number }
  ) {
    const account = this.csService.getAccount(id);
    if (!account) throw new NotFoundException(`Account ${id} not found`);

    const amount = body.potentialARR || (account.plan === 'Enterprise' ? 45000 : 18000);

    const sfdcOpp = await this.sfdcService.createExpansionOpportunity({
      AccountId: account.sfdcAccountId,
      Name: `${account.name} - Compute Expansion (${account.quotaUtilizationPercent}% Quota)`,
      StageName: 'Qualification',
      Amount: amount,
      CloseDate: new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
      Type: 'Existing Customer - Upgrade',
      Description: `CSM Hand-off to AE: Account has saturated ${account.quotaUtilizationPercent}% of compute capacity across ${account.activeWorkloads} workloads.`,
    });

    return {
      success: true,
      accountName: account.name,
      opportunity: sfdcOpp,
      message: `Expansion opportunity pushed to Salesforce Account Executive pipeline.`,
    };
  }
}
