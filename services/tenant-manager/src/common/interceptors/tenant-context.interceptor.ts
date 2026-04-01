import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Request } from 'express';

export interface JwtPayload {
  sub: string;
  email: string;
  tenantId?: string | null;
  isPlatformAdmin: boolean;
  roles?: string[];
  isImpersonating?: boolean;
  realUserId?: string;
}

/**
 * Interceptor that extracts tenant context from the incoming request and
 * attaches it to the request for downstream use. Also logs tenant-scoped
 * operations for observability.
 */
@Injectable()
export class TenantContextInterceptor implements NestInterceptor {
  private readonly logger = new Logger(TenantContextInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<
      Request & { user?: JwtPayload; tenantId?: string }
    >();

    // Attach tenantId from JWT payload or from route param to request context
    const user = request.user;
    const routeTenantId = request.params['id'];

    if (user?.tenantId) {
      request.tenantId = user.tenantId;
    } else if (routeTenantId && !user?.isPlatformAdmin) {
      request.tenantId = routeTenantId;
    }

    const startTime = Date.now();

    return next.handle().pipe(
      tap({
        next: () => {
          this.logger.debug(
            `${request.method} ${request.url} completed in ${Date.now() - startTime}ms` +
              (request.tenantId ? ` [tenant=${request.tenantId}]` : ''),
          );
        },
        error: (err: Error) => {
          this.logger.warn(
            `${request.method} ${request.url} failed in ${Date.now() - startTime}ms: ${err.message}`,
          );
        },
      }),
    );
  }
}
