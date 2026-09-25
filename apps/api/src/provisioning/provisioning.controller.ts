import { Controller, Post, Param } from '@nestjs/common';
import { ProvisioningService } from './provisioning.service';

@Controller('v1/provisioning')
export class ProvisioningController {
  constructor(private readonly provisioningService: ProvisioningService) {}

  @Post('tick')
  tick() {
    return this.provisioningService.tick();
  }

  @Post(':applicationId')
  provisionApp(@Param('applicationId') applicationId: string) {
    return this.provisioningService.provisionApp(applicationId);
  }
}
