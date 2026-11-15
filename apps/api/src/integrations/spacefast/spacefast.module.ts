import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SpacefastService } from './spacefast.service';

@Module({
  imports: [ConfigModule],
  providers: [SpacefastService],
  exports: [SpacefastService],
})
export class SpacefastModule {}
