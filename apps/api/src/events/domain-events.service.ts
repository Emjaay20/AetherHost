import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';

export interface DomainEvent {
  tenantId: string;
  applicationId?: string | null;
  eventName: string;
  payload?: any;
}

@Injectable()
export class DomainEventsService {
  constructor(private readonly prisma: PrismaService) {}

  async publish(event: DomainEvent, tx?: Prisma.TransactionClient) {
    const prismaClient = tx || this.prisma;
    await prismaClient.domainEventRecord.create({
      data: {
        tenantId: event.tenantId,
        applicationId: event.applicationId,
        eventName: event.eventName,
        payload: event.payload ? event.payload : null,
      }
    });
  }

  async getForTenant(tenantId: string) {
    const records = await this.prisma.domainEventRecord.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'asc' }
    });
    
    return records.map(r => ({
      tenantId: r.tenantId,
      applicationId: r.applicationId,
      eventName: r.eventName,
      payload: r.payload,
      createdAt: r.createdAt
    }));
  }
}
