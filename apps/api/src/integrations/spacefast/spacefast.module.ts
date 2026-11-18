import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SpacefastService } from './spacefast.service';
import { SpacefastTenantService } from './spacefast-tenant.service';
import { SpacefastTenantController } from './spacefast-tenant.controller';
import { SpacefastOAuthController } from './spacefast-oauth.controller';
import { SpacefastOAuthService } from './spacefast-oauth.service';
import { SpacefastOperationReconcilerService } from './spacefast-operation-reconciler.service';
import { SecretVaultService } from '../../common/crypto/secret-vault.service';

@Module({
  imports: [ConfigModule],
  controllers: [SpacefastTenantController, SpacefastOAuthController],
  providers: [
    SpacefastService,
    SpacefastOAuthService,
    SpacefastTenantService,
    SpacefastOperationReconcilerService,
    SecretVaultService,
  ],
  exports: [SpacefastService, SpacefastOAuthService, SpacefastTenantService],
})
export class SpacefastModule {}
