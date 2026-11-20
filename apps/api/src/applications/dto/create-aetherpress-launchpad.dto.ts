import { IsOptional, IsString, IsUrl, MaxLength } from 'class-validator';

export class CreateAetherPressLaunchpadDto {
  @IsOptional()
  @IsString()
  @IsUrl({ require_protocol: true, protocols: ['https'] })
  @MaxLength(2048)
  wordpressSiteUrl?: string;
}
