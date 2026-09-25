import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { ReadyController } from './ready.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [HealthController, ReadyController],
})
export class HealthModule {}
