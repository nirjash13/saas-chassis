import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { PERMISSIONS_KEY } from '../decorators/require-permissions.decorator';
import { JwtPayload } from '../../modules/auth/jwt.strategy';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // No permissions metadata — allow through (rely on JwtAuthGuard alone)
    if (!required || required.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request & { user?: JwtPayload }>();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('No authenticated user');
    }

    // Platform admins bypass permission checks
    if (user.isPlatformAdmin) {
      return true;
    }

    const userPermissions: string[] = user.permissions ?? [];
    const hasAll = required.every((perm) => userPermissions.includes(perm));

    if (!hasAll) {
      throw new ForbiddenException(
        `Missing required permission(s): ${required.join(', ')}`,
      );
    }

    return true;
  }
}
