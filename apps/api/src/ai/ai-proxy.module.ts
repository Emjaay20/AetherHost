import { Module } from '@nestjs/common';
import { AiProxyController } from './ai-proxy.controller';
import { AiProxyService } from './ai-proxy.service';
import { OpsInsightService } from './ops-insight.service';
import { AiProvisioningService } from './ai-provisioning.service';
import { StubModelAdapter } from './adapters/stub.adapter';
import { OpenAICompatibleAdapter } from './adapters/openai.adapter';
import { ModelFactory } from './model.factory';
import { EntitlementsModule } from '../entitlements/entitlements.module';
import { DomainEventsModule } from '../events/domain-events.module';
import { PrismaModule } from '../prisma/prisma.module';
import { ApplicationsModule } from '../applications/applications.module';

@Module({
  imports: [EntitlementsModule, DomainEventsModule, PrismaModule, ApplicationsModule],
  controllers: [AiProxyController],
  providers: [AiProxyService, OpsInsightService, AiProvisioningService, ModelFactory, StubModelAdapter, OpenAICompatibleAdapter],
})
export class AiProxyModule {}
