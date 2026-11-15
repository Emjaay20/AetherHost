import { Module } from '@nestjs/common';
import { SpacefastService } from './spacefast.service';

@Module({
  providers: [SpacefastService],
  exports: [SpacefastService],
})
export class SpacefastModule {}
