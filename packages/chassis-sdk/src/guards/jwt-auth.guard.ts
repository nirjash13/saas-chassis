import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

export const IS_PUBLIC_KEY = 'isPublic';

/** Mark a route or controller as publicly accessible (no identity headers required). */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

/**
 * Global guard that verifies gateway-forwarded identity headers are present.
 * The API Gateway validates the JWT; data-plane services trust forwarded headers.
 * Mark a route with @Public() to skip this check.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest();
    const userId = request.headers['x-user-id'];

    if (!userId) {
      throw new UnauthorizedException('Missing gateway identity headers');
    }

    return true;
  }
}
