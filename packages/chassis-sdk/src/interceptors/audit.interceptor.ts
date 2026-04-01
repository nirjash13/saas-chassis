import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Inject,
  Optional,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { AUDIT_ACTION_KEY } from '../decorators/audit-log.decorator';

export interface AuditPublisher {
  publish(event: {
    tenantId: string;
    userId: string;
    action: string;
    resourceType: string;
    resourceId?: string;
    changes?: Record<string, unknown>;
    requestId?: string;
    serviceName: string;
  }): void;
}

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(
    private reflector: Reflector,
    @Optional()
    @Inject('AUDIT_PUBLISHER')
    private auditPublisher?: AuditPublisher,
    @Optional()
    @Inject('CHASSIS_OPTIONS')
    private options?: { serviceName: string },
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const auditAction = this.reflector.get<string>(
      AUDIT_ACTION_KEY,
      context.getHandler(),
    );
    if (!auditAction || !this.auditPublisher) return next.handle();

    const req = context.switchToHttp().getRequest();
    const tenantId = req.headers['x-tenant-id'] as string;
    const userId = req.headers['x-user-id'] as string;

    return next.handle().pipe(
      tap((responseData: Record<string, unknown> | undefined) => {
        this.auditPublisher?.publish({
          tenantId,
          userId,
          action: auditAction,
          resourceType: context
            .getClass()
            .name.replace('Controller', ''),
          resourceId: (responseData as Record<string, Record<string, string>>)
            ?.data?.id,
          changes: { body: req.body },
          requestId: req.headers['x-request-id'] as string,
          serviceName: this.options?.serviceName || 'unknown',
        });
      }),
    );
  }
}
