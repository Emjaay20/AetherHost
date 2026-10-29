import { BadRequestException } from '@nestjs/common';

const IMAGE_RE = /^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,200}$/;
const HEALTH_RE = /^\/[A-Za-z0-9._/-]{0,80}$/;
const WORKER_RE = /^[A-Za-z0-9_ ./:=@,-]{1,200}$/;
const ENV_KEY_RE = /^[a-zA-Z_][a-zA-Z0-9_]{0,63}$/;

const RESERVED_ENV_KEYS = new Set([
  'DATABASE_URL',
  'REDIS_URL',
  'POSTGRES_USER',
  'POSTGRES_PASSWORD',
  'POSTGRES_DB',
  'AETHERHOST_WORKER_COMMAND',
]);

export type WorkloadInput = {
  runtime: string;
  dockerImage?: string;
  envVars?: Record<string, string>;
  workerCommand?: string;
  withPostgres?: boolean;
  withMariaDb?: boolean;
  withRedis?: boolean;
  port?: number;
  healthPath?: string;
};

export function validateDockerImage(rawImage: string): string {
  const image = rawImage?.trim();
  if (!image || !IMAGE_RE.test(image) || image.includes('..') || image.includes('://')) {
    throw new BadRequestException('dockerImage is not a valid image reference');
  }
  return image;
}

export function assertWorkloadSpec(input: WorkloadInput): void {
  const image = input.dockerImage?.trim();
  const worker = input.workerCommand?.trim();
  if (input.runtime === 'wordpress') {
    if (image || worker || input.withPostgres || input.withMariaDb || input.withRedis) {
      throw new BadRequestException(
        'WordPress does not accept a custom image or sidecar',
      );
    }
    validateEnvironment(input.envVars, false);
    return;
  }

  // A GitHub/source deployment uses the repository's own Dockerfile and compose
  // configuration. It still needs protected runtime environment variables, but
  // it must not be forced into the separate pre-built-image workload contract.
  const needsImage = Boolean(
    worker || input.withPostgres || input.withMariaDb || input.withRedis || input.port || input.healthPath,
  );
  if (needsImage && !image) {
    throw new BadRequestException(
      'dockerImage is required for a worker, datastore, port, or health-check contract',
    );
  }
  if (image && (!IMAGE_RE.test(image) || image.includes('..') || image.includes('://'))) {
    throw new BadRequestException('dockerImage is not a valid image reference');
  }
  if (worker && !WORKER_RE.test(worker)) {
    throw new BadRequestException(
      'workerCommand contains unsupported characters',
    );
  }
  if (input.port != null && (input.port < 1 || input.port > 65535)) {
    throw new BadRequestException('port is out of range');
  }
  if (
    input.healthPath &&
    (!HEALTH_RE.test(input.healthPath) || input.healthPath.includes('..'))
  ) {
    throw new BadRequestException('healthPath must be a relative path');
  }
  validateEnvironment(input.envVars, Boolean(image));
}

function validateEnvironment(
  envVars?: Record<string, string>,
  protectsPlatformConnections = false,
): void {
  if (!envVars) {
    return;
  }
  const keys = Object.keys(envVars);
  if (keys.length > 40) {
    throw new BadRequestException('envVars exceeds 40 keys');
  }
  for (const key of keys) {
    if (protectsPlatformConnections && RESERVED_ENV_KEYS.has(key)) {
      throw new BadRequestException(`${key} is owned by the platform`);
    }
    if (!ENV_KEY_RE.test(key)) {
      throw new BadRequestException(`invalid env key ${key}`);
    }
    const value = envVars[key];
    if (
      typeof value !== 'string' ||
      value.length > 4096 ||
      /[\r\n\0]/.test(value)
    ) {
      throw new BadRequestException(`invalid env value for ${key}`);
    }
  }
}
