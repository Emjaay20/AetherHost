import { Module } from '@nestjs/common';
import { makeCounterProvider } from '@willsoto/nestjs-prometheus';
import { EntitlementsService } from './entitlements.service';
import { EntitlementsController } from './entitlements.controller';

@Module({
  controllers: [EntitlementsController],
  providers: [
    EntitlementsService,
    makeCounterProvider({
      name: 'aetherhost_applications_provisioned_total',
      help: 'Total number of applications provisioned',
      labelNames: ['tenant_id']
    }),
    makeCounterProvider({
      name: 'aetherhost_ai_requests_total',
      help: 'Total number of AI requests made',
      labelNames: ['tenant_id', 'model']
    })
  ],
  exports: [EntitlementsService] // Exported so ApplicationsModule can use it
})
export class EntitlementsModule {}
