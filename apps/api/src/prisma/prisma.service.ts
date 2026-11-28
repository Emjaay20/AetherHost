import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { redactAuditMetadata } from '../applications/log-redaction';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  constructor() {
    super();
    this.$use(async (params, next) => {
      if (params.model === 'AuditLog' && ['create', 'createMany', 'update', 'updateMany', 'upsert'].includes(params.action)) {
        const sanitize = (data: unknown): unknown => {
          if (Array.isArray(data)) return data.map(sanitize);
          if (!data || typeof data !== 'object') return data;
          const record = data as Record<string, unknown>;
          return 'metadata' in record ? { ...record, metadata: redactAuditMetadata(record.metadata) } : record;
        };
        if (params.args?.data) params.args.data = sanitize(params.args.data);
        if (params.args?.create) params.args.create = sanitize(params.args.create);
        if (params.args?.update) params.args.update = sanitize(params.args.update);
      }
      return next(params);
    });
  }
  async onModuleInit() {
    await this.$connect();
  }
}
