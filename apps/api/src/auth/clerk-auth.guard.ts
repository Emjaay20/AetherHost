import { CanActivate, ExecutionContext, Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { clerkClient } from '@clerk/clerk-sdk-node';

@Injectable()
export class ClerkAuthGuard implements CanActivate {
  private readonly logger = new Logger(ClerkAuthGuard.name);

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      const agentKey = request.headers['x-agent-key'];
      if (agentKey && agentKey === process.env.AGENT_SECRET_KEY) {
        request.tenantId = 'SYSTEM'; // Special tenant ID for internal agent
        return true;
      }
      throw new UnauthorizedException('Missing or invalid Authorization header');
    }

    const token = authHeader.split(' ')[1];

    try {
      const decoded = await clerkClient.verifyToken(token, {
        secretKey: process.env.CLERK_SECRET_KEY,
      });
      // Inject tenantId (the user's ID) directly into the request
      request.tenantId = decoded.sub;
      return true;
    } catch (error) {
      this.logger.error(`Clerk auth failed: ${error.message}`);
      throw new UnauthorizedException('Invalid or expired token');
    }
  }
}
