import { Controller, Get, Post, Delete, Param, Body, Query, UseGuards, Request } from '@nestjs/common';
import { ApplicationsService } from './applications.service';
import { Runtime } from '@aetherhost/domain';
import { ClerkAuthGuard } from '../auth/clerk-auth.guard';

@Controller('v1/applications')
@UseGuards(ClerkAuthGuard)
export class ApplicationsController {
  constructor(private readonly applicationsService: ApplicationsService) {}

  @Post()
  create(@Body() body: { tenantId: string; name: string; runtime: Runtime }) {
    return this.applicationsService.create(body.tenantId, body.name, body.runtime);
  }

  @Get()
  findAll(@Request() req: any, @Query('status') status?: string, @Query('runtime') runtime?: string) {
    // The Go agent might not send a token, but the frontend will.
    // If we want the Go agent to work, we need to bypass auth for internal requests or issue an admin token.
    // Let's assume the Go agent uses a special token or IP, but for now we'll allow it if auth is missing?
    // Wait, ClerkAuthGuard will block it if missing.
    // The Go agent fetches `GET /v1/applications?status=pending` WITHOUT a token!
    return this.applicationsService.findAll(status, runtime, req.tenantId);
  }

  @Delete(':id/hard')
  hardDelete(@Param('id') id: string) {
    return this.applicationsService.hardDelete(id);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.applicationsService.remove(id);
  }
}
