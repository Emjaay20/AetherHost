import { Module } from '@nestjs/common';
import { ProvisioningController } from './provisioning.controller';
import { ProvisioningService } from './provisioning.service';
import { ProvisionerFactory } from './provisioner.factory';
import { WordpressProvisioner } from './stubs/wordpress.provisioner';
import { PhpProvisioner } from './stubs/php.provisioner';
import { NodejsProvisioner } from './stubs/nodejs.provisioner';
import { PythonProvisioner } from './stubs/python.provisioner';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [NotificationsModule],
  controllers: [ProvisioningController],
  providers: [
    ProvisioningService, 
    ProvisionerFactory,
    WordpressProvisioner,
    PhpProvisioner,
    NodejsProvisioner,
    PythonProvisioner,
  ],
})
export class ProvisioningModule {}
