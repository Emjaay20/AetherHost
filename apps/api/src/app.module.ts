import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { AetherThrottlerGuard } from './auth/aether-throttler.guard';
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
import { ApiKeysModule } from './api-keys/api-keys.module';
import { NotificationsModule } from './notifications/notifications.module';

import { PrometheusModule } from '@willsoto/nestjs-prometheus';
import { ScheduleModule } from '@nestjs/schedule';
import { BandwidthService } from './bandwidth.service';
import { CacheModule } from '@nestjs/cache-manager';
import { redisStore } from 'cache-manager-redis-store';
import { BullModule } from '@nestjs/bullmq';

function getRedisConfig() {
  if (process.env.REDIS_URL) {
    try {
      const parsed = new URL(process.env.REDIS_URL);
      return {
        host: parsed.hostname,
        port: Number(parsed.port || 6379),
        password: parsed.password ? decodeURIComponent(parsed.password) : undefined,
        username: parsed.username ? decodeURIComponent(parsed.username) : undefined,
        ...(parsed.protocol === 'rediss:' ? { tls: {} } : {}),
      };
    } catch {
      // Fallback to host/port env vars
    }
  }
  return {
    host: process.env.REDIS_HOST || 'localhost',
    port: Number(process.env.REDIS_PORT || 6379),
    ...(process.env.REDIS_PASSWORD ? { password: process.env.REDIS_PASSWORD } : {}),
  };
}

const redisConfig = getRedisConfig();

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
      ...redisConfig,
    }),
    BullModule.forRoot({
      connection: redisConfig,
    }),
    // Universal Gap #6: Rate limiting
    ThrottlerModule.forRoot([{
      ttl: 60000,
      limit: 600, // 600 requests per minute with localhost exemption
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
    AuthModule,
    ApiKeysModule,
    NotificationsModule,
  ],
  controllers: [AppController, TelemetryController],
  providers: [
    AppService,
    BandwidthService,
    {
      provide: APP_GUARD,
      useClass: AetherThrottlerGuard,
    }
  ],
})
export class AppModule {}
