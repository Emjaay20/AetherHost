import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
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

import { PrometheusModule } from '@willsoto/nestjs-prometheus';
import { ScheduleModule } from '@nestjs/schedule';
import { BandwidthService } from './bandwidth.service';
import { CacheModule } from '@nestjs/cache-manager';
import { redisStore } from 'cache-manager-redis-store';
import { BullModule } from '@nestjs/bullmq';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrometheusModule.register({
      path: '/v1/metrics',
    }),
    ScheduleModule.forRoot(),
    CacheModule.register({
      isGlobal: true,
      store: redisStore,
      host: process.env.REDIS_HOST || 'localhost',
      port: 6379,
    }),
    BullModule.forRoot({
      connection: {
        host: process.env.REDIS_HOST || 'localhost',
        port: 6379,
      },
    }),
    // Universal Gap #6: Rate limiting
    ThrottlerModule.forRoot([{
      ttl: 60000,
      limit: 100, // 100 requests per minute by default
    }]),
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
  providers: [
    AppService,
    BandwidthService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    }
  ],
})
export class AppModule {}
