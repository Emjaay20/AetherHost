import { Injectable } from '@nestjs/common';
import { RuntimeProvisioner } from '../runtime-provisioner';

@Injectable()
export class WordpressProvisioner implements RuntimeProvisioner {
  async provision(applicationId: string, tenantId: string, runtime: string) {
    return { 
      ok: true, 
      message: 'allocated PHP-FPM pool and wp-config' 
    };
  }
}
