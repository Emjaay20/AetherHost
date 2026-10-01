import { Injectable } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

@Injectable()
export class AdminService {
  async getAllTenants() {
    return prisma.tenant.findMany({
      include: {
        entitlements: true,
        _count: {
          select: { applications: true }
        }
      },
      orderBy: { id: 'desc' }
    });
  }
}
