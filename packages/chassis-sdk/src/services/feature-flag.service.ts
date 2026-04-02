import { Injectable, Inject, Optional, Logger } from '@nestjs/common';
import { ChassisOptions } from '../config/chassis.config';

@Injectable()
export class FeatureFlagService {
  private readonly logger = new Logger(FeatureFlagService.name);
  private readonly cache = new Map<string, { value: boolean; expiresAt: number }>();
  private readonly cacheTtlMs = 60_000; // 1 minute

  constructor(
    @Optional()
    @Inject('CHASSIS_OPTIONS')
    private readonly options?: ChassisOptions,
  ) {}

  async isEnabled(tenantId: string, featureCode: string): Promise<boolean> {
    if (!this.options?.tenantManagerUrl || !this.options?.enableFeatureGating) {
      return true;
    }

    const cacheKey = `${tenantId}:${featureCode}`;
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.value;
    }

    try {
      const url = `${this.options.tenantManagerUrl}/api/v1/tenants/${tenantId}/features/${featureCode}`;
      const response = await fetch(url, {
        headers: {
          'X-Service-Token': this.options.serviceToken ?? '',
          'Content-Type': 'application/json',
        },
        signal: AbortSignal.timeout(5_000),
      });

      if (!response.ok) {
        this.logger.warn(
          `Feature flag check failed for ${featureCode}: HTTP ${response.status}`,
        );
        return false;
      }

      const body = (await response.json()) as { data?: { isEnabled?: boolean } };
      const enabled = body?.data?.isEnabled ?? false;

      this.cache.set(cacheKey, {
        value: enabled,
        expiresAt: Date.now() + this.cacheTtlMs,
      });

      return enabled;
    } catch (err) {
      this.logger.warn(
        `Feature flag check error for ${featureCode}: ${String(err)}`,
      );
      return false;
    }
  }
}
