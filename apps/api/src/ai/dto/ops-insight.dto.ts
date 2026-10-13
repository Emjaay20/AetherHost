import { IsOptional, IsString, MaxLength } from 'class-validator';

export class GenerateOpsInsightDto {
  @IsOptional()
  @IsString()
  @MaxLength(128)
  applicationId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  customPrompt?: string;
}
