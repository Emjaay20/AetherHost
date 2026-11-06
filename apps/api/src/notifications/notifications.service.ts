import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

type Delivery = { to: string; title: string; body: string; data?: Record<string, string> };

export interface SlackAlertPayload {
  appName: string;
  eventType: 'deployment_success' | 'deployment_failed' | 'service_unhealthy' | 'test_alert';
  message: string;
  url?: string;
  details?: Record<string, string>;
  webhookUrl?: string;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  constructor(private readonly prisma: PrismaService) {}

  async registerDevice(tenantId: string, token: string, platform: string) {
    return this.prisma.pushDevice.upsert({
      where: { token },
      update: { tenantId, platform, enabled: true },
      create: { tenantId, token, platform },
    });
  }

  async setEnabled(tenantId: string, enabled: boolean) {
    await this.prisma.pushDevice.updateMany({ where: { tenantId }, data: { enabled } });
    return { enabled };
  }

  async preferences(tenantId: string) {
    const devices = await this.prisma.pushDevice.findMany({ where: { tenantId }, select: { id: true, platform: true, enabled: true, updatedAt: true } });
    return { enabled: devices.some((device) => device.enabled), devices };
  }

  async removeDevice(tenantId: string, token: string) {
    await this.prisma.pushDevice.deleteMany({ where: { tenantId, token } });
    return { success: true };
  }

  async sendToTenant(tenantId: string, message: Omit<Delivery, 'to'>) {
    const devices = await this.prisma.pushDevice.findMany({ where: { tenantId, enabled: true }, select: { token: true } });
    if (!devices.length) return { delivered: 0 };
    const payload = devices.map((device) => ({ to: device.token, sound: 'default', ...message }));
    try {
      const response = await fetch('https://exp.host/--/api/v2/push/send', { method: 'POST', headers: { Accept: 'application/json', 'Accept-Encoding': 'gzip, deflate', 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      if (!response.ok) throw new Error(`Expo push response ${response.status}`);
      return { delivered: devices.length };
    } catch (error) {
      this.logger.warn(`Push delivery failed: ${error instanceof Error ? error.message : 'unknown error'}`);
      return { delivered: 0 };
    }
  }

  /**
   * Check whether Slack Incoming Webhook is configured
   */
  getSlackStatus() {
    const configured = Boolean(process.env.SLACK_WEBHOOK_URL?.trim());
    return {
      configured,
      webhookConfigured: configured,
      events: [
        'deployment_failed',
        'service_unhealthy',
        'deployment_success',
      ],
    };
  }

  /**
   * Dispatch a rich Slack Block Kit notification for deployments, health failures, or release checks
   */
  async sendSlackAlert(payload: SlackAlertPayload): Promise<{ success: boolean; error?: string }> {
    const webhookUrl = payload.webhookUrl || process.env.SLACK_WEBHOOK_URL?.trim();

    if (!webhookUrl) {
      this.logger.log(`[Slack Alert Skipped] No webhook URL configured. Alert: ${payload.eventType} for ${payload.appName}`);
      return { success: false, error: 'No Slack webhook configured' };
    }

    const icons: Record<string, string> = {
      deployment_failed: '🚨',
      service_unhealthy: '⚠️',
      deployment_success: '🚀',
      test_alert: '🔔',
    };

    const titles: Record<string, string> = {
      deployment_failed: 'Deployment Failed / Release Check Failed',
      service_unhealthy: 'Service Unhealthy / Readiness Failure',
      deployment_success: 'Deployment Succeeded & Live',
      test_alert: 'AetherHost Slack Integration Test',
    };

    const icon = icons[payload.eventType] || '📢';
    const headerTitle = `${icon} ${titles[payload.eventType] || 'Deployment Alert'}: ${payload.appName}`;
    const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19) + ' UTC';

    const fields = [
      { type: 'mrkdwn', text: `*Application:*\n${payload.appName}` },
      { type: 'mrkdwn', text: `*Event:*\n${payload.eventType}` },
      { type: 'mrkdwn', text: `*Time:*\n${timestamp}` },
      { type: 'mrkdwn', text: `*Status:*\n${payload.eventType === 'deployment_success' ? 'Healthy / Live' : 'Action Required'}` },
    ];

    if (payload.details) {
      for (const [k, v] of Object.entries(payload.details)) {
        fields.push({ type: 'mrkdwn', text: `*${k}:*\n${v}` });
      }
    }

    const blocks: any[] = [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: headerTitle.substring(0, 150),
          emoji: true,
        },
      },
      {
        type: 'section',
        fields,
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Message Details:*\n>${payload.message.replace(/\n/g, '\n>')}`,
        },
      },
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: `AetherHost DevOps & Reliability Control Plane • <https://console.aetherhost.com.ng|Open Console>${payload.url ? ` • <${payload.url}|View Deployment>` : ''}`,
          },
        ],
      },
    ];

    try {
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: `${icon} [${payload.eventType}] ${payload.appName}: ${payload.message}`,
          blocks,
        }),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Slack API error HTTP ${response.status}: ${text}`);
      }

      this.logger.log(`[Slack Alert Delivered] ${payload.eventType} for ${payload.appName}`);
      return { success: true };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Failed to send Slack alert: ${errorMsg}`);
      return { success: false, error: errorMsg };
    }
  }

  /**
   * Helper to fire a demonstrable test alert
   */
  async sendSlackTest(tenantId: string, options?: Partial<SlackAlertPayload>) {
    const payload: SlackAlertPayload = {
      appName: options?.appName || 'preflight-web',
      eventType: options?.eventType || 'deployment_failed',
      message: options?.message || 'Health probe check failed on endpoint /health (HTTP 502 Bad Gateway). Service failing readiness checks.',
      webhookUrl: options?.webhookUrl,
      details: {
        Environment: 'production',
        Tenant: tenantId,
        'Release Check': 'Preflight Verification',
      },
      url: 'https://console.aetherhost.com.ng',
    };

    const result = await this.sendSlackAlert(payload);
    return {
      dispatched: true,
      delivered: result.success,
      error: result.error,
      payload,
    };
  }
}
