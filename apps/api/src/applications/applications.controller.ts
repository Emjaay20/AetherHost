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
import { TenantId, SYSTEM_TENANT_ID } from '../auth/tenant.decorator';

@Controller('v1/applications')
export class ApplicationsController {
  constructor(private readonly applicationsService: ApplicationsService) {}

  @Post()
  create(@TenantId() tenantId: string, @Body() body: CreateApplicationDto) {
    if (tenantId === SYSTEM_TENANT_ID) {
      tenantId = 'user_3Jxd6h5lIR82rBjvdlrZ8uINHGv';
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
    @Body() body: { status: string },
  ) {
    if (tenantId !== SYSTEM_TENANT_ID) {
      throw new ForbiddenException('Only system agent can update status directly');
    }
    return this.applicationsService.updateStatus(id, body.status);
  }

  @Post(':id/logs')
  async addLog(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Body() body: { log: string },
  ) {
    if (tenantId !== SYSTEM_TENANT_ID) {
      throw new ForbiddenException('Only system agent can push logs');
    }
    return this.applicationsService.addLog(id, body.log);
  }

  @Get(':id/logs')
  getLogs(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.applicationsService.getLogs(id, tenantId);
  }

}
