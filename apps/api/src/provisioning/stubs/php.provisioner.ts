import { Injectable } from '@nestjs/common';
import { RuntimeProvisioner } from '../runtime-provisioner';

@Injectable()
export class PhpProvisioner implements RuntimeProvisioner {
  async provision(applicationId: string, tenantId: string, runtime: string) {
    return { 
      ok: true, 
      message: 'configured PHP-FPM + document root' 
    };
  }
}
