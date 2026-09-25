import { Module } from '@nestjs/common';
import { ClerkWebhookController } from './webhooks.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [ClerkWebhookController],
})
export class AuthModule {}
