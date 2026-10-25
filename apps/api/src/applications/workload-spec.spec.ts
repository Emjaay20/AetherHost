import { BadRequestException } from '@nestjs/common';
import { assertWorkloadSpec } from './workload-spec';

describe('assertWorkloadSpec', () => {
  const signaldesk = {
    runtime: 'nodejs',
    dockerImage: 'ghcr.io/acme/signaldesk:1.4.0',
    workerCommand: 'node dist/worker.js',
    withPostgres: true,
    withMariaDb: true,
    withRedis: true,
    port: 3000,
    healthPath: '/health',
    envVars: { NODE_ENV: 'production' },
  };

  it('accepts an api, worker, Postgres, MariaDB, and Redis contract', () => {
    expect(() => assertWorkloadSpec(signaldesk)).not.toThrow();
  });

  it('accepts a MariaDB-only image workload', () => {
    expect(() =>
      assertWorkloadSpec({
        runtime: 'nodejs',
        dockerImage: 'ghcr.io/acme/mariadb-client:1.0.0',
        withMariaDb: true,
      }),
    ).not.toThrow();
  });

  it('ignores a simple runtime with no image', () => {
    expect(() => assertWorkloadSpec({ runtime: 'nodejs' })).not.toThrow();
  });

  it('accepts protected environment variables for a GitHub/source deployment', () => {
    expect(() =>
      assertWorkloadSpec({
        runtime: 'github',
        envVars: { FIELD_SESSION_SECRET: 'server-only-secret' },
      }),
    ).not.toThrow();
  });

  it('allows a source deployment to supply its own isolated Redis connection', () => {
    expect(() =>
      assertWorkloadSpec({
        runtime: 'github',
        envVars: { REDIS_URL: 'redis://:private-password@resolvegrid-redis:6379' },
      }),
    ).not.toThrow();
  });

  it('still rejects a managed workload overriding its Redis connection', () => {
    expect(() =>
      assertWorkloadSpec({
        ...signaldesk,
        envVars: { REDIS_URL: 'redis://override@untrusted-host:6379' },
      }),
    ).toThrow(BadRequestException);
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
