import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { v4 as uuidv4 } from 'uuid';

export interface ApiResponse<T> {
  success: boolean;
  data: T | null;
  error: null;
  meta: {
    requestId: string;
    timestamp: string;
    pagination?: {
      page: number;
      pageSize: number;
      totalCount: number;
      totalPages: number;
    };
  };
}

@Injectable()
export class ResponseEnvelopeInterceptor<T>
  implements NestInterceptor<T, ApiResponse<T>>
{
  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<ApiResponse<T>> {
    const req = context.switchToHttp().getRequest();

    return next.handle().pipe(
      map((data) => ({
        success: true,
        data,
        error: null,
        meta: {
          requestId:
            (req.headers['x-request-id'] as string) || uuidv4(),
          timestamp: new Date().toISOString(),
          ...(data?.pagination
            ? { pagination: data.pagination }
            : {}),
        },
      })),
    );
  }
}
