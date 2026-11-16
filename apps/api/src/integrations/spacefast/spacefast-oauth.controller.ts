import { Body, Controller, Delete, Get, Post, Query, Res } from '@nestjs/common';
import { IsString } from 'class-validator';
import { Public } from '../../auth/public.decorator';
import { TenantId } from '../../auth/tenant.decorator';
import { SpacefastOAuthService } from './spacefast-oauth.service';

class SelectTeamDto {
  @IsString()
  teamId!: string;
}

@Controller('v1/integrations/spacefast')
export class SpacefastOAuthController {
  constructor(private readonly oauth: SpacefastOAuthService) {}

  @Get('connection')
  status(@TenantId() tenantId: string) {
    return this.oauth.status(tenantId);
  }

  @Post('oauth/start')
  begin(@TenantId() tenantId: string) {
    return this.oauth.begin(tenantId);
  }

  @Public()
  @Get('oauth/callback')
  async callback(
    @Query('state') state: string | undefined,
    @Query('code') code: string | undefined,
    @Query('error') error: string | undefined,
    @Query('error_description') errorDescription: string | undefined,
    @Res() response: { redirect: (url: string) => void },
  ) {
    response.redirect(await this.oauth.complete({ state, code, error, errorDescription }));
  }

  @Get('teams')
  teams(@TenantId() tenantId: string) {
    return this.oauth.teams(tenantId);
  }

  @Post('team')
  selectTeam(@TenantId() tenantId: string, @Body() body: SelectTeamDto) {
    return this.oauth.selectTeam(tenantId, body.teamId);
  }

  @Delete('connection')
  async disconnect(@TenantId() tenantId: string) {
    await this.oauth.disconnect(tenantId);
    return { success: true };
  }
}
