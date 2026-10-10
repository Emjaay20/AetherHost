import { IsIn, IsOptional, IsString, Matches } from 'class-validator';

export class ApplyPlanDto {
  @IsIn(['starter', 'pro', 'max'])
  planId: string;

  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{8,80}$/)
  idempotencyKey?: string;
}
