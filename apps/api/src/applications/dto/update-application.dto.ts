import { IsIn, IsNotEmpty, IsString, MaxLength, IsOptional, IsObject, IsBoolean } from 'class-validator';

export class UpdateApplicationStatusDto {
  @IsString()
  @IsNotEmpty()
  @IsIn(['pending', 'provisioning', 'running', 'failed'])
  status!: string;
}

export class AddApplicationLogDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(65536)
  log!: string;
}

export class UpdateEnvVarsDto {
  @IsObject()
  @IsOptional()
  envVars?: Record<string, string>;

  @IsBoolean()
  @IsOptional()
  redeploy?: boolean;
}

export class RedeployApplicationDto {
  @IsObject()
  @IsOptional()
  envVars?: Record<string, string>;
}
