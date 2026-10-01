import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const SYSTEM_TENANT_ID = 'SYSTEM';

export const TenantId = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const request = ctx.switchToHttp().getRequest();
    return request.tenantId;
  },
);
