import { IsOptional, IsString } from 'class-validator';

export class SuspendDto {
  @IsOptional()
  @IsString()
  reason?: string;
}
