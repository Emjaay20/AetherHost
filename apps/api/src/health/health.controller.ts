import { Controller, Get } from '@nestjs/common';
import { Public } from '../auth/public.decorator';

@Public()
@Controller('v1/health')
export class HealthController {
  @Get()
  check() {
    return { status: 'ok' };
  }
}
