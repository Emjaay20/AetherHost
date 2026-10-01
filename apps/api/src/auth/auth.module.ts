import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ClerkWebhookController } from './webhooks.controller';
import { ClerkAuthGuard } from './clerk-auth.guard';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [ClerkWebhookController],
  providers: [
    ClerkAuthGuard,
    {
      provide: APP_GUARD,
      useClass: ClerkAuthGuard,
    },
  ],
  exports: [ClerkAuthGuard],
})
export class AuthModule {}
