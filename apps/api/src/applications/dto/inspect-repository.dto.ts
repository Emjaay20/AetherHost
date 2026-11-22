import { IsString, Matches, MaxLength } from 'class-validator';

export class InspectRepositoryDto {
  @IsString()
  @MaxLength(500)
  @Matches(/^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(?:\.git)?\/?$/i, {
    message: 'githubRepo must be a GitHub HTTPS repository URL',
  })
  githubRepo!: string;
}
