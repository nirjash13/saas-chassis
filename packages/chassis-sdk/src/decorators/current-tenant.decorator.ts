import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { TenantContext } from '../types/tenant-context.interface';

export const CurrentTenant = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): TenantContext => {
    const request = ctx.switchToHttp().getRequest();
    return {
      tenantId: request.headers['x-tenant-id'] as string,
      tenantSlug: request.headers['x-tenant-slug'] as string,
      userId: request.headers['x-user-id'] as string,
      roles: (request.headers['x-roles'] as string)?.split(',') || [],
      isPlatformAdmin: request.headers['x-is-platform-admin'] === 'true',
      permissions:
        (request.headers['x-permissions'] as string)?.split(',') || [],
    };
  },
);
