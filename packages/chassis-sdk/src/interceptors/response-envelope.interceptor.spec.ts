import { ExecutionContext, CallHandler } from '@nestjs/common';
import { of } from 'rxjs';
import { firstValueFrom } from 'rxjs';
import { ResponseEnvelopeInterceptor, ApiResponse } from './response-envelope.interceptor';

function makeContext(requestId?: string): ExecutionContext {
  const headers: Record<string, string> = {};
  if (requestId) headers['x-request-id'] = requestId;

  return {
    switchToHttp: jest.fn().mockReturnValue({
      getRequest: () => ({ headers }),
    }),
  } as unknown as ExecutionContext;
}

function makeHandler<T>(value: T): CallHandler {
  return { handle: () => of(value) };
}

describe('ResponseEnvelopeInterceptor', () => {
  let interceptor: ResponseEnvelopeInterceptor<unknown>;

  beforeEach(() => {
    interceptor = new ResponseEnvelopeInterceptor();
  });

  describe('plain response wrapping', () => {
    it('wraps a plain object in { success: true, data: ... }', async () => {
      const payload = { id: '1', name: 'Alice' };
      const context = makeContext('req-1');
      const handler = makeHandler(payload);

      const result$ = interceptor.intercept(context, handler);
      const result = await firstValueFrom(result$) as ApiResponse<typeof payload>;

      expect(result.success).toBe(true);
      expect(result.data).toEqual(payload);
      expect(result.error).toBeNull();
    });

    it('sets meta.requestId from the x-request-id header', async () => {
      const context = makeContext('my-request-id');
      const handler = makeHandler({ value: 42 });

      const result$ = interceptor.intercept(context, handler);
      const result = await firstValueFrom(result$) as ApiResponse<unknown>;

      expect(result.meta.requestId).toBe('my-request-id');
    });

    it('generates a requestId when x-request-id header is absent', async () => {
      const context = makeContext();
      const handler = makeHandler({ value: 42 });

      const result$ = interceptor.intercept(context, handler);
      const result = await firstValueFrom(result$) as ApiResponse<unknown>;

      expect(typeof result.meta.requestId).toBe('string');
      expect(result.meta.requestId.length).toBeGreaterThan(0);
    });

    it('sets meta.timestamp as an ISO string', async () => {
      const context = makeContext();
      const handler = makeHandler({});

      const result$ = interceptor.intercept(context, handler);
      const result = await firstValueFrom(result$) as ApiResponse<unknown>;

      expect(() => new Date(result.meta.timestamp)).not.toThrow();
      expect(new Date(result.meta.timestamp).toISOString()).toBe(result.meta.timestamp);
    });
  });

  describe('null response', () => {
    it('wraps null in { success: true, data: null }', async () => {
      const context = makeContext('req-null');
      const handler = makeHandler(null);

      const result$ = interceptor.intercept(context, handler);
      const result = await firstValueFrom(result$) as ApiResponse<null>;

      expect(result.success).toBe(true);
      expect(result.data).toBeNull();
      expect(result.error).toBeNull();
    });

    it('does not set meta.pagination when data is null', async () => {
      const context = makeContext();
      const handler = makeHandler(null);

      const result$ = interceptor.intercept(context, handler);
      const result = await firstValueFrom(result$) as ApiResponse<null>;

      expect(result.meta.pagination).toBeUndefined();
    });
  });

  describe('pagination handling (SDK-5 fix)', () => {
    it('nests pagination under meta.pagination, not flat-spread', async () => {
      const pagination = { page: 2, pageSize: 10, totalCount: 55, totalPages: 6 };
      const payload = { items: ['a', 'b'], pagination };
      const context = makeContext('req-page');
      const handler = makeHandler(payload);

      const result$ = interceptor.intercept(context, handler);
      const result = await firstValueFrom(result$) as ApiResponse<typeof payload>;

      // Pagination must be nested under meta.pagination
      expect(result.meta.pagination).toEqual(pagination);

      // Pagination must NOT be flat-spread onto meta
      expect((result.meta as Record<string, unknown>).page).toBeUndefined();
      expect((result.meta as Record<string, unknown>).pageSize).toBeUndefined();
      expect((result.meta as Record<string, unknown>).totalCount).toBeUndefined();
      expect((result.meta as Record<string, unknown>).totalPages).toBeUndefined();
    });

    it('preserves the original data payload including the pagination key', async () => {
      const pagination = { page: 1, pageSize: 5, totalCount: 12, totalPages: 3 };
      const payload = { items: [1, 2, 3], pagination };
      const context = makeContext();
      const handler = makeHandler(payload);

      const result$ = interceptor.intercept(context, handler);
      const result = await firstValueFrom(result$) as ApiResponse<typeof payload>;

      expect(result.data).toEqual(payload);
    });

    it('does not set meta.pagination when response has no pagination field', async () => {
      const payload = { id: '42', name: 'widget' };
      const context = makeContext();
      const handler = makeHandler(payload);

      const result$ = interceptor.intercept(context, handler);
      const result = await firstValueFrom(result$) as ApiResponse<typeof payload>;

      expect(result.meta.pagination).toBeUndefined();
    });
  });
});
