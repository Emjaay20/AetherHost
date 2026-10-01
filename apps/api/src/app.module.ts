import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { TelemetryController } from './telemetry.controller';
import { HealthModule } from './health/health.module';
import { ApplicationsModule } from './applications/applications.module';
import { EntitlementsModule } from './entitlements/entitlements.module';
import { AdminModule } from './admin/admin.module';
import { DomainEventsModule } from './events/domain-events.module';
import { PrismaModule } from './prisma/prisma.module';
import { ProvisioningModule } from './provisioning/provisioning.module';
import { AiProxyModule } from './ai/ai-proxy.module';
import { BillingModule } from './billing/billing.module';
import { AuthModule } from './auth/auth.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule, 
    HealthModule, 
    DomainEventsModule, 
    EntitlementsModule,
    AdminModule, 
    ApplicationsModule, 
    ProvisioningModule, 
    AiProxyModule, 
    BillingModule, 
    AuthModule
  ],
  controllers: [AppController, TelemetryController],
  providers: [AppService],
})
export class AppModule {}
