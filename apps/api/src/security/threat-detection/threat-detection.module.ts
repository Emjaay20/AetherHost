import { Module, Global } from '@nestjs/common';
import { PreflightSecurityService } from './preflight-security.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { AiProxyModule } from '../../ai/ai-proxy.module';

@Global()
@Module({
  imports: [PrismaModule, AiProxyModule],
  providers: [PreflightSecurityService],
  exports: [PreflightSecurityService],
})
export class ThreatDetectionModule {}
