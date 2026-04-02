export class ApiResponseDto<T = unknown> {
  success!: boolean;
  data?: T;
  message?: string;
  errors?: string[];
  meta?: Record<string, unknown>;

  constructor(partial: Partial<ApiResponseDto<T>>) {
    Object.assign(this, partial);
  }

  static ok<T>(data: T, message?: string): ApiResponseDto<T> {
    return new ApiResponseDto({ success: true, data, message });
  }

  static created<T>(data: T): ApiResponseDto<T> {
    return new ApiResponseDto({
      success: true,
      data,
      message: 'Created successfully',
    });
  }

  static error(message: string, errors?: string[]): ApiResponseDto<null> {
    return new ApiResponseDto({ success: false, message, errors });
  }

  static paginated<T>(
    data: T[],
    total: number,
    page: number,
    limit: number,
  ): ApiResponseDto<T[]> {
    return new ApiResponseDto({
      success: true,
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  }
}
