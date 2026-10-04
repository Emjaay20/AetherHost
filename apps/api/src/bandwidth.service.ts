import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from './prisma/prisma.service';

@Injectable()
export class BandwidthService {
  private readonly logger = new Logger(BandwidthService.name);

  constructor(private readonly prisma: PrismaService) {}

  @Cron(CronExpression.EVERY_30_SECONDS)
  async aggregateBandwidth() {
    this.logger.debug('Aggregating bandwidth from Prometheus...');
    try {
      // Prometheus HTTP API endpoint (assuming it's accessible via aetherhost-net at prometheus:9090)
      const promUrl = process.env.PROMETHEUS_URL || 'http://prometheus:9090';
      
      // Query traefik_service_responses_bytes_total
      const res = await fetch(`${promUrl}/api/v1/query?query=sum(traefik_service_responses_bytes_total)+by+(service)`);
      if (!res.ok) {
        this.logger.warn('Could not reach Prometheus or query failed');
        return;
      }
      
      const data = await res.json();
      if (data.status !== 'success' || !data.data || !data.data.result) return;

      const results = data.data.result;
      
      // Fetch all apps to map service name -> tenantId
      const apps = await this.prisma.application.findMany();
      const tenantBandwidth = new Map<string, number>();

      for (const result of results) {
        const serviceName = result.metric?.service; // e.g. "aetherhost-my-wp-app-1@docker"
        if (!serviceName) continue;

        // Parse bytes (value is a [timestamp, "string value"] array)
        const bytesString = result.value?.[1];
        if (!bytesString) continue;
        
        const bytes = parseFloat(bytesString);
        if (isNaN(bytes) || bytes === 0) continue;

        // Find which app this service belongs to
        // serviceName is usually like "aetherhost-<safename>-<something>@docker"
        // Let's just find an app whose safeName is in the serviceName
        const matchedApp = apps.find(app => {
          const safeName = app.name.toLowerCase().replace(/ /g, '-');
          return serviceName.includes(`aetherhost-${safeName}`);
        });

        if (matchedApp) {
          const current = tenantBandwidth.get(matchedApp.tenantId) || 0;
          tenantBandwidth.set(matchedApp.tenantId, current + bytes);
        }
      }

      // Update Database
      for (const [tenantId, totalBytes] of tenantBandwidth.entries()) {
        const totalMb = totalBytes / (1024 * 1024);
        await this.prisma.tenantEntitlement.update({
          where: { tenantId },
          data: { usageBandwidthMb: totalMb }
        }).catch(() => {});
      }
    } catch (e) {
      this.logger.error('Failed to aggregate bandwidth from Prometheus', e);
    }
  }
}
