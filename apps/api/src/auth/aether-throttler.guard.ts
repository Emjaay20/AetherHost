import { ExecutionContext, Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import * as crypto from 'crypto';

@Injectable()
export class AetherThrottlerGuard extends ThrottlerGuard {
  protected async shouldSkip(context: ExecutionContext): Promise<boolean> {
    const { req } = this.getRequestResponse(context);

    // 1. Skip rate limiting for loopback/localhost requests (Dashboard SSR, internal components)
    const ip = req.ip || req.connection?.remoteAddress || '';
    if (
      ip === '127.0.0.1' ||
      ip === '::1' ||
      ip === '::ffff:127.0.0.1' ||
      ip === 'localhost'
    ) {
      return true;
    }

    // 2. Skip rate limiting for the internal Go Agent with valid secret key (timing-safe)
    const agentKey = req.headers['x-agent-key'];
    const expectedAgentKey = process.env.AGENT_SECRET_KEY;
    if (typeof agentKey === 'string' && expectedAgentKey) {
      const aBuf = Buffer.from(agentKey);
      const bBuf = Buffer.from(expectedAgentKey);
      if (
        aBuf.length === bBuf.length &&
        crypto.timingSafeEqual(aBuf, bBuf)
      ) {
        return true;
      }
    }

    return false;
  }

  protected async getTracker(req: Record<string, unknown>): Promise<string> {
    // If authenticated tenant exists, track per-tenant rather than penalizing shared network IPs
    if (typeof req.tenantId === 'string' && req.tenantId !== 'SYSTEM') {
      return `tenant_${req.tenantId}`;
    }
    return super.getTracker(req);
  }
}
