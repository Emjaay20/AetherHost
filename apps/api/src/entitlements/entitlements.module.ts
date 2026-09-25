import { Module } from '@nestjs/common';
import { EntitlementsService } from './entitlements.service';
import { EntitlementsController } from './entitlements.controller';

@Module({
  controllers: [EntitlementsController],
  providers: [EntitlementsService],
  exports: [EntitlementsService] // Exported so ApplicationsModule can use it
})
export class EntitlementsModule {}
