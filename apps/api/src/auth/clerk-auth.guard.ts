import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { clerkClient } from '@clerk/clerk-sdk-node';
import { timingSafeEqual } from 'crypto';
import { IS_PUBLIC_KEY } from './public.decorator';
import { SYSTEM_TENANT_ID } from './tenant.decorator';

function safeCompare(a: string, b: string): boolean {
  try {
    return timingSafeEqual(Buffer.from(a), Buffer.from(b));
  } catch {
    return false;
  }
}

@Injectable()
export class ClerkAuthGuard implements CanActivate {
  private readonly logger = new Logger(ClerkAuthGuard.name);

  constructor(private readonly reflector: Reflector) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers.authorization as string | undefined;
    const agentKey = request.headers['x-agent-key'] as string | undefined;
    const expectedAgentKey = process.env.AGENT_SECRET_KEY;

    if (agentKey && expectedAgentKey && safeCompare(agentKey, expectedAgentKey)) {
      request.tenantId = SYSTEM_TENANT_ID;
      return true;
    }

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException(
        'Missing or invalid Authorization header',
      );
    }

    const token = authHeader.split(' ')[1];

    try {
      const decoded = await clerkClient.verifyToken(token, {
        secretKey: process.env.CLERK_SECRET_KEY,
      });
      request.tenantId = decoded.sub;
      return true;
    } catch (error: any) {
      this.logger.error(`Clerk auth failed: ${error.message}`);
      throw new UnauthorizedException('Invalid or expired token');
    }
  }
}
