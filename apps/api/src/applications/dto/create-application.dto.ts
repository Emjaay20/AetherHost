import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { Runtime } from '@aetherhost/domain';

export class CreateApplicationDto {
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name: string;

  @IsEnum(Runtime)
  runtime: Runtime;

  githubRepo?: string;
  githubRepoName?: string;
  githubRepoDescription?: string;
  dockerCompose?: string;
  aiFiles?: { path: string; content: string }[];
  @IsOptional()
  @IsString()
  @MaxLength(200)
  dockerImage?: string;

  @IsOptional()
  @IsObject()
  envVars?: Record<string, string>;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  workerCommand?: string;

  @IsOptional()
  @IsBoolean()
  withPostgres?: boolean;

  @IsOptional()
  @IsBoolean()
  withRedis?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(65535)
  port?: number;

  @IsOptional()
  @IsString()
  @Matches(/^\/[A-Za-z0-9._/-]*$/)
  healthPath?: string;
}
