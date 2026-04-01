import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredPermission = this.reflector.getAllAndOverride<string>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!requiredPermission) return true;

    const request = context.switchToHttp().getRequest();
    const isPlatformAdmin =
      request.headers['x-is-platform-admin'] === 'true';
    if (isPlatformAdmin) return true;

    const userPermissions =
      (request.headers['x-permissions'] as string)?.split(',') || [];
    if (!userPermissions.includes(requiredPermission)) {
      throw new ForbiddenException({
        code: 'INSUFFICIENT_PERMISSIONS',
        message: `Required permission: ${requiredPermission}`,
      });
    }
    return true;
  }
}
