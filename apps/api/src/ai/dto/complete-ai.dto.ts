import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CompleteAiDto {
  @IsString()
  @MinLength(1)
  @MaxLength(8000)
  prompt: string;

  @IsString()
  @MinLength(1)
  @MaxLength(80)
  purpose: string;

  @IsOptional()
  @IsString()
  applicationId?: string;
}
