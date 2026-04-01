import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';

/**
 * Guard that validates the X-Service-Token header for internal inter-service calls.
 * Used on endpoints that should only be accessible by other services in the platform,
 * not by end-user clients.
 */
@Injectable()
export class InternalServiceGuard implements CanActivate {
  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const token = request.headers['x-service-token'];
    const expected = this.configService.get<string>('app.internalServiceToken');

    if (!token || !expected) {
      throw new UnauthorizedException('Missing X-Service-Token header');
    }

    if (token !== expected) {
      throw new UnauthorizedException('Invalid X-Service-Token');
    }

    return true;
  }
}
