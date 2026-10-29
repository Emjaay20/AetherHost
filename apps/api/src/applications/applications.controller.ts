import {
  Controller,
  Get,
  Post,
  Delete,
  Patch,
  Param,
  Body,
  Query,
  Header,
  ForbiddenException,
} from '@nestjs/common';
import { ApplicationsService } from './applications.service';
import { CreateApplicationDto } from './dto/create-application.dto';
import {
  AddApplicationLogDto,
  UpdateApplicationStatusDto,
  UpdateEnvVarsDto,
  RedeployApplicationDto,
  UpdateCustomDomainDto,
  UpdateDockerImageDto,
} from './dto/update-application.dto';
import { TenantId, SYSTEM_TENANT_ID } from '../auth/tenant.decorator';
import { Public } from '../auth/public.decorator';

@Controller('v1/applications')
export class ApplicationsController {
  constructor(private readonly applicationsService: ApplicationsService) {}

  @Public()
  @Get('preview/:safeName')
  @Header('Cache-Control', 'no-store')
  getPreviewBySafeName(@Param('safeName') safeName: string) {
    return this.applicationsService.findPreviewBySafeName(safeName);
  }

  @Post()
  create(@TenantId() tenantId: string, @Body() body: CreateApplicationDto) {
    if (tenantId === SYSTEM_TENANT_ID) {
      const configuredTenantId = process.env.DEFAULT_SYSTEM_TENANT_ID?.trim();
      if (!configuredTenantId) {
        throw new ForbiddenException(
          'System agent cannot create applications without DEFAULT_SYSTEM_TENANT_ID configured',
        );
      }
      tenantId = configuredTenantId;
    }
    return this.applicationsService.create(
      tenantId,
      body.name,
      body.runtime,
      body.githubRepo,
      body.dockerCompose,
      body.aiFiles,
      body.githubRepoName,
      body.githubRepoDescription,
      body.customDomain,
      body.dockerImage,
      body.envVars,
      body.workerCommand,
      body.withPostgres,
      body.withMariaDb,
      body.withRedis,
      body.port,
      body.healthPath,
    );
  }

  @Get()
  @Header('Cache-Control', 'no-store') // Crucial: prevents GitHub OAuth tokens injected for the system agent from being cached
  findAll(
    @TenantId() tenantId: string,
    @Query('status') status?: string,
    @Query('runtime') runtime?: string,
  ) {
    return this.applicationsService.findAll(status, runtime, tenantId);
  }

  @Delete(':id/hard')
  hardDelete(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.applicationsService.hardDelete(id, tenantId);
  }

  @Delete(':id')
  remove(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.applicationsService.remove(id, tenantId);
  }

  @Patch(':id/status')
  updateStatusPatch(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Body() body: UpdateApplicationStatusDto,
  ) {
    if (tenantId !== SYSTEM_TENANT_ID) {
      throw new ForbiddenException('Only system agent can update status directly');
    }
    return this.applicationsService.updateStatus(id, body.status);
  }

  @Get(':id/logs')
  @Header('Cache-Control', 'no-store')
  getLogs(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.applicationsService.getLogs(id, tenantId);
  }

  @Get(':id/timeline')
  getTimeline(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.applicationsService.getTimeline(id, tenantId);
  }

  @Get(':id/domain-status')
  getDomainStatus(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.applicationsService.getDomainStatus(id, tenantId);
  }

  @Post(':id/logs')
  async addLog(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Body() body: AddApplicationLogDto,
  ) {
    if (tenantId !== SYSTEM_TENANT_ID) {
      throw new ForbiddenException('Only system agent can push logs');
    }
    return this.applicationsService.addLog(id, body.log);
  }

  @Get(':id/env')
  getEnvVars(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.applicationsService.getEnvVars(id, tenantId);
  }

  @Patch(':id/env')
  updateEnvVars(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Body() body: UpdateEnvVarsDto,
  ) {
    return this.applicationsService.updateEnvVars(
      id,
      tenantId,
      body.envVars || {},
      body.redeploy ?? true,
    );
  }

  @Patch(':id/domain')
  updateCustomDomain(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Body() body: UpdateCustomDomainDto,
  ) {
    return this.applicationsService.updateCustomDomain(
      id,
      tenantId,
      body.customDomain ?? null,
    );
  }

  @Patch(':id/image')
  updateDockerImage(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Body() body: UpdateDockerImageDto,
  ) {
    return this.applicationsService.updateDockerImage(
      id,
      tenantId,
      body.dockerImage,
      body.redeploy ?? true,
    );
  }

  @Post(':id/redeploy')
  redeploy(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Body() body?: RedeployApplicationDto,
  ) {
    return this.applicationsService.redeploy(
      id,
      tenantId,
      body?.envVars,
      body?.dockerImage,
    );
  }
}
