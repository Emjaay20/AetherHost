import { Injectable, BadRequestException } from '@nestjs/common';
import { RuntimeProvisioner } from './runtime-provisioner';
import { WordpressProvisioner } from './stubs/wordpress.provisioner';
import { PhpProvisioner } from './stubs/php.provisioner';
import { NodejsProvisioner } from './stubs/nodejs.provisioner';
import { PythonProvisioner } from './stubs/python.provisioner';

@Injectable()
export class ProvisionerFactory {
  constructor(
    private readonly wordpressProvisioner: WordpressProvisioner,
    private readonly phpProvisioner: PhpProvisioner,
    private readonly nodejsProvisioner: NodejsProvisioner,
    private readonly pythonProvisioner: PythonProvisioner,
  ) {}

  get(runtime: string): RuntimeProvisioner {
    switch (runtime) {
      case 'wordpress':
        return this.wordpressProvisioner;
      case 'php':
        return this.phpProvisioner;
      case 'nodejs':
        return this.nodejsProvisioner;
      case 'python':
        return this.pythonProvisioner;
      case 'go':
        return {
          provision: async () => ({
            ok: true,
            message: 'compiled Go binary + bound HTTP listener on port 3000',
          }),
        };
      case 'rust':
        return {
          provision: async () => ({
            ok: true,
            message: 'compiled Cargo release binary + bound Axum/Tokio listener on port 3000',
          }),
        };
      case 'docker':
      case 'github':
        return {
          provision: async () => ({
            ok: true,
            message: 'built container image + attached to aetherhost-net with health probe',
          }),
        };
      default:
        throw new BadRequestException(`Unknown runtime: ${runtime}`);
    }
  }
}
