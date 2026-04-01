import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requiredRoles) return true;

    const request = context.switchToHttp().getRequest();
    const isPlatformAdmin =
      request.headers['x-is-platform-admin'] === 'true';
    if (isPlatformAdmin) return true;

    const userRoles =
      (request.headers['x-roles'] as string)?.split(',') || [];
    return requiredRoles.some((role) => userRoles.includes(role));
  }
}
