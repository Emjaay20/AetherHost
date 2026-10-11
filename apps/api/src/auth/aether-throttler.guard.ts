import { ExecutionContext, Injectable, Logger } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

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

    // 2. Skip rate limiting for the internal Go Agent with valid secret key
    const agentKey = req.headers['x-agent-key'];
    const expectedAgentKey = process.env.AGENT_SECRET_KEY;
    if (agentKey && expectedAgentKey && agentKey === expectedAgentKey) {
      return true;
    }

    return false;
  }

  protected async getTracker(req: Record<string, any>): Promise<string> {
    // If authenticated tenant exists, track per-tenant rather than penalizing shared network IPs
    if (req.tenantId && req.tenantId !== 'SYSTEM') {
      return `tenant_${req.tenantId}`;
    }
    return super.getTracker(req);
  }
}
