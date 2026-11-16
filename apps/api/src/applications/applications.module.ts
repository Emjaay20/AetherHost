import { Module } from '@nestjs/common';
import { ApplicationsController } from './applications.controller';
import { ApplicationsService } from './applications.service';
import { GitSyncService } from './git-sync.service';
import { EntitlementsModule } from '../entitlements/entitlements.module';
import { GithubWebhookController } from '../webhooks/github.controller';
import { SecretVaultService } from '../common/crypto/secret-vault.service';

@Module({
  imports: [EntitlementsModule],
  controllers: [ApplicationsController, GithubWebhookController],
  providers: [ApplicationsService, GitSyncService, SecretVaultService],
  exports: [ApplicationsService, GitSyncService, SecretVaultService],
})
export class ApplicationsModule {}
