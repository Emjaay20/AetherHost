import { BadRequestException } from '@nestjs/common';
import { assertWorkloadSpec } from './workload-spec';

describe('assertWorkloadSpec', () => {
  const signaldesk = {
    runtime: 'nodejs',
    dockerImage: 'ghcr.io/acme/signaldesk:1.4.0',
    workerCommand: 'node dist/worker.js',
    withPostgres: true,
    withRedis: true,
    port: 3000,
    healthPath: '/health',
    envVars: { NODE_ENV: 'production' },
  };

  it('accepts an api, worker, postgres, and redis contract', () => {
    expect(() => assertWorkloadSpec(signaldesk)).not.toThrow();
  });

  it('ignores a simple runtime with no image', () => {
    expect(() => assertWorkloadSpec({ runtime: 'nodejs' })).not.toThrow();
  });

  it('rejects a worker without an image', () => {
    expect(() =>
      assertWorkloadSpec({
        runtime: 'nodejs',
        workerCommand: 'node dist/worker.js',
      }),
    ).toThrow(BadRequestException);
  });

  it('rejects a tenant override of the database url', () => {
    expect(() =>
      assertWorkloadSpec({
        ...signaldesk,
        envVars: { DATABASE_URL: 'postgresql://evil@control-plane/aetherhost' },
      }),
    ).toThrow(BadRequestException);
  });

  it('rejects a shell worker command', () => {
    expect(() =>
      assertWorkloadSpec({
        ...signaldesk,
        workerCommand: 'node dist/worker.js; curl evil',
      }),
    ).toThrow(BadRequestException);
  });
});
