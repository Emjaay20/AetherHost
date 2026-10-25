import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

type Delivery = { to: string; title: string; body: string; data?: Record<string, string> };

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
}
