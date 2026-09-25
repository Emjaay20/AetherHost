import { Controller, Get, HttpException, HttpStatus } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Controller('v1/ready')
export class ReadyController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async ready() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: 'ready', checks: { postgres: 'ok' } };
    } catch (e) {
      throw new HttpException(
        { status: 'not_ready', checks: { postgres: 'fail' } },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }
}
