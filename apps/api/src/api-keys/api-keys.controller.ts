import { Controller, Get, Post, Delete, Body, Param } from '@nestjs/common';
import { ApiKeysService } from './api-keys.service';
import { TenantId } from '../auth/tenant.decorator';
import { IsOptional, IsString } from 'class-validator';

class CreateApiKeyDto {
  @IsOptional()
  @IsString()
  name?: string;
}

@Controller('v1/api-keys')
export class ApiKeysController {
  constructor(private readonly apiKeysService: ApiKeysService) {}

  @Post()
  createKey(
    @TenantId() tenantId: string,
    @Body() body: CreateApiKeyDto,
  ) {
    return this.apiKeysService.createKey(tenantId, body?.name);
  }

  @Get()
  listKeys(@TenantId() tenantId: string) {
    return this.apiKeysService.listKeys(tenantId);
  }

  @Delete(':id')
  revokeKey(
    @TenantId() tenantId: string,
    @Param('id') id: string,
  ) {
    return this.apiKeysService.revokeKey(tenantId, id);
  }
}
