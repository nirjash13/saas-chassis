import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { JwtPayload } from '../../modules/auth/strategies/jwt.strategy';
import { RabbitMqPublisherService } from '../messaging/rabbitmq-publisher.service';

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditInterceptor.name);

  constructor(private readonly rabbitMqPublisher: RabbitMqPublisherService) {}

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
          if (user) {
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
            this.rabbitMqPublisher.publish('chassis.audit', 'http.request', event);
          }
        },
        error: () => {
          // Do not audit failed requests here; services handle their own error auditing
        },
      }),
    );
  }
}
