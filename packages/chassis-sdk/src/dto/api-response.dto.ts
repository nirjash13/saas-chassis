export class ApiResponseDto<T> {
  success: boolean;
  data: T | null;
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  } | null;
  meta: {
    requestId: string;
    timestamp: string;
    pagination?: PaginationMeta;
  };
}

export class PaginationMeta {
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
}
