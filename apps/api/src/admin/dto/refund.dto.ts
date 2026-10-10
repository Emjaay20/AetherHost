import { IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class RefundDto {
  @IsOptional()
  @IsNumber()
  @Min(0)
  amountDollars?: number;

  @IsOptional()
  @IsString()
  reason?: string;
}
