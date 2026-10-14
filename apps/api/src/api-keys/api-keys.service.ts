import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { randomBytes, createHash } from 'crypto';

@Injectable()
export class ApiKeysService {
  constructor(private readonly prisma: PrismaService) {}

  private hashKey(key: string): string {
    return createHash('sha256').update(key).digest('hex');
  }

  async createKey(tenantId: string, name?: string) {
    const rawSecret = randomBytes(24).toString('hex');
    const rawKey = `aeth_live_${rawSecret}`;
    const keyHash = this.hashKey(rawKey);
    const keyPrefix = `${rawKey.slice(0, 14)}...${rawKey.slice(-4)}`;

    const apiKey = await this.prisma.apiKey.create({
      data: {
        tenantId,
        name: name?.trim() || 'CLI Key',
        keyHash,
        keyPrefix,
      },
    });

    return {
      id: apiKey.id,
      name: apiKey.name,
      key: rawKey,
      keyPrefix: apiKey.keyPrefix,
      createdAt: apiKey.createdAt,
    };
  }

  async listKeys(tenantId: string) {
    return this.prisma.apiKey.findMany({
      where: { tenantId },
      select: {
        id: true,
        name: true,
        keyPrefix: true,
        createdAt: true,
        lastUsedAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async revokeKey(tenantId: string, id: string) {
    const key = await this.prisma.apiKey.findFirst({
      where: { id, tenantId },
    });
    if (!key) {
      throw new NotFoundException('API Key not found');
    }
    await this.prisma.apiKey.delete({ where: { id } });
    return { success: true };
  }

  async verifyKey(rawKey: string): Promise<string | null> {
    const keyHash = this.hashKey(rawKey);
    const apiKey = await this.prisma.apiKey.findUnique({
      where: { keyHash },
    });

    if (!apiKey) {
      return null;
    }

    this.prisma.apiKey
      .update({
        where: { id: apiKey.id },
        data: { lastUsedAt: new Date() },
      })
      .catch(() => {});

    return apiKey.tenantId;
  }
}
