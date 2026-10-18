import { Module } from '@nestjs/common';
import { ApplicationsController } from './applications.controller';
import { ApplicationsService } from './applications.service';
import { GitSyncService } from './git-sync.service';
import { EntitlementsModule } from '../entitlements/entitlements.module';
import { GithubWebhookController } from '../webhooks/github.controller';

@Module({
  imports: [EntitlementsModule],
  controllers: [ApplicationsController, GithubWebhookController],
  providers: [ApplicationsService, GitSyncService],
  exports: [ApplicationsService, GitSyncService],
})
export class ApplicationsModule {}
