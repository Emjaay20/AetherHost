import { Injectable } from '@nestjs/common';
import { RuntimeProvisioner } from '../runtime-provisioner';

@Injectable()
export class PythonProvisioner implements RuntimeProvisioner {
  async provision(applicationId: string, tenantId: string, runtime: string) {
    return { 
      ok: true, 
      message: 'planned venv + gunicorn/uvicorn bind' 
    };
  }
}
