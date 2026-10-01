import { IsEnum, IsString, MaxLength, MinLength } from 'class-validator';
import { Runtime } from '@aetherhost/domain';

export class CreateApplicationDto {
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name: string;

  @IsEnum(Runtime)
  runtime: Runtime;

  githubRepo?: string;
  dockerCompose?: string;
  aiFiles?: { path: string; content: string }[];
}
