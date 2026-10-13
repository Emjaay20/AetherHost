import { IsIn, IsNotEmpty, IsString, MaxLength } from 'class-validator';

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
