import { IsString, MaxLength, MinLength, IsOptional, IsBoolean } from 'class-validator';

export class ProvisionAiDto {
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  prompt: string;

  @IsOptional()
  @IsString()
  repositoryName?: string;

  @IsOptional()
  @IsString()
  repositoryDescription?: string;

  @IsOptional()
  @IsBoolean()
  generateDescription?: boolean;
}
