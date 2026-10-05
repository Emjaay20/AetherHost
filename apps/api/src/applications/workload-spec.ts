import { BadRequestException } from '@nestjs/common';

const IMAGE_RE = /^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,200}$/;
const HEALTH_RE = /^\/[A-Za-z0-9._/-]{0,80}$/;
const WORKER_RE = /^[A-Za-z0-9_ ./:=@,-]{1,200}$/;
const ENV_KEY_RE = /^[A-Z_][A-Z0-9_]{0,63}$/;

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
  withRedis?: boolean;
  port?: number;
  healthPath?: string;
};

export function assertWorkloadSpec(input: WorkloadInput): void {
  const image = input.dockerImage?.trim();
  const worker = input.workerCommand?.trim();
  const hasEnv = input.envVars && Object.keys(input.envVars).length > 0;
  const wantsWorkload = Boolean(
    image ||
    worker ||
    input.withPostgres ||
    input.withRedis ||
    hasEnv ||
    input.port ||
    input.healthPath,
  );
  if (!wantsWorkload) {
    return;
  }
  if (input.runtime === 'wordpress') {
    throw new BadRequestException(
      'WordPress does not accept a custom image or sidecar',
    );
  }
  if (!image) {
    throw new BadRequestException(
      'dockerImage is required for a worker, datastore, or env contract',
    );
  }
  if (!IMAGE_RE.test(image) || image.includes('..') || image.includes('://')) {
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
  if (!input.envVars) {
    return;
  }
  const keys = Object.keys(input.envVars);
  if (keys.length > 40) {
    throw new BadRequestException('envVars exceeds 40 keys');
  }
  for (const key of keys) {
    if (RESERVED_ENV_KEYS.has(key)) {
      throw new BadRequestException(`${key} is owned by the platform`);
    }
    if (!ENV_KEY_RE.test(key)) {
      throw new BadRequestException(`invalid env key ${key}`);
    }
    const value = input.envVars[key];
    if (
      typeof value !== 'string' ||
      value.length > 500 ||
      /[\r\n\0]/.test(value)
    ) {
      throw new BadRequestException(`invalid env value for ${key}`);
    }
  }
}
