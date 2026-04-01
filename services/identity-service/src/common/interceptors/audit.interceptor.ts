import {
  CallHandler,
  ExecutionContext,
  Inject,
  Injectable,
  Logger,
  NestInterceptor,
  Optional,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { ClientProxy } from '@nestjs/microservices';
import { JwtPayload } from '../../modules/auth/strategies/jwt.strategy';

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditInterceptor.name);

  constructor(
    @Optional() @Inject('RABBITMQ_CLIENT') private readonly client: ClientProxy | null,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<{
      method: string;
      url: string;
      ip: string;
      user?: JwtPayload;
    }>();

    const { method, url, user } = request;

    // Only audit mutating operations
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
      return next.handle();
    }

    const startTime = Date.now();

    return next.handle().pipe(
      tap({
        next: () => {
          if (user && this.client) {
            const event = {
              userId: user.sub,
              action: `${method.toLowerCase()}:${url}`,
              meta: {
                url,
                method,
                durationMs: Date.now() - startTime,
                tenantId: user.tenantId,
                isImpersonating: user.isImpersonating,
                realUserId: user.realUserId,
              },
              timestamp: new Date().toISOString(),
            };
            this.client.emit('audit.http', event).subscribe({
              error: (err: Error) =>
                this.logger.warn(`Failed to publish audit event: ${err.message}`),
            });
          }
        },
        error: () => {
          // Do not audit failed requests here; services handle their own error auditing
        },
      }),
    );
  }
}
