import { Injectable, Inject, Optional, Logger } from '@nestjs/common';
import { ChassisOptions } from '../config/chassis.config';

export interface InternalRequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  headers?: Record<string, string>;
  timeoutMs?: number;
}

@Injectable()
export class InternalHttpService {
  private readonly logger = new Logger(InternalHttpService.name);

  constructor(
    @Optional()
    @Inject('CHASSIS_OPTIONS')
    private readonly options?: ChassisOptions,
  ) {}

  async request<T>(
    url: string,
    reqOptions: InternalRequestOptions = {},
  ): Promise<T> {
    const {
      method = 'GET',
      body,
      headers = {},
      timeoutMs = 10_000,
    } = reqOptions;

    const mergedHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Service-Name': this.options?.serviceName ?? 'unknown',
      ...headers,
    };

    if (this.options?.serviceToken) {
      mergedHeaders['X-Service-Token'] = this.options.serviceToken;
    }

    try {
      const response = await fetch(url, {
        method,
        headers: mergedHeaders,
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(timeoutMs),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`HTTP ${response.status}: ${text}`);
      }

      return response.json() as Promise<T>;
    } catch (err) {
      this.logger.error(`Internal HTTP request failed [${method} ${url}]: ${String(err)}`);
      throw err;
    }
  }

  async get<T>(url: string, options?: Omit<InternalRequestOptions, 'method' | 'body'>): Promise<T> {
    return this.request<T>(url, { ...options, method: 'GET' });
  }

  async post<T>(url: string, body: unknown, options?: Omit<InternalRequestOptions, 'method' | 'body'>): Promise<T> {
    return this.request<T>(url, { ...options, method: 'POST', body });
  }
}
