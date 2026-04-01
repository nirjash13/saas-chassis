import {
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ClientProxy } from '@nestjs/microservices';
import Redis from 'ioredis';
import { FeatureDefinition } from './entities/feature-definition.entity';
import { TenantFeature } from './entities/tenant-feature.entity';
import { ToggleFeatureDto } from './dto/toggle-feature.dto';
import { TenantFeatureToggledEvent } from '../tenants/events/tenant-provisioned.event';

export interface FeatureWithStatus {
  code: string;
  name: string;
  description: string | null;
  category: string;
  defaultEnabled: boolean;
  requiresPlan: string | null;
  isEnabled: boolean;
  hasOverride: boolean;
}

@Injectable()
export class FeaturesService {
  private readonly logger = new Logger(FeaturesService.name);
  private readonly cacheTtlSeconds = 300; // 5 minutes

  constructor(
    @InjectRepository(FeatureDefinition)
    private readonly featureDefRepo: Repository<FeatureDefinition>,
    @InjectRepository(TenantFeature)
    private readonly tenantFeatureRepo: Repository<TenantFeature>,
    @Inject('REDIS_CLIENT')
    private readonly redis: Redis,
    @Optional() @Inject('RABBITMQ_CLIENT') private readonly rabbitClient: ClientProxy | null,
  ) {}

  // ─── Feature Definitions ─────────────────────────────────────────────────

  async findAllDefinitions(): Promise<FeatureDefinition[]> {
    return this.featureDefRepo.find({ order: { category: 'ASC', code: 'ASC' } });
  }

  async findDefinitionByCode(code: string): Promise<FeatureDefinition> {
    const def = await this.featureDefRepo.findOne({ where: { code } });
    if (!def) {
      throw new NotFoundException(`Feature definition '${code}' not found`);
    }
    return def;
  }

  // ─── Tenant Feature Overrides ─────────────────────────────────────────────

  /**
   * Returns a merged view: all feature definitions with tenant-specific override status.
   */
  async findTenantFeatures(tenantId: string): Promise<FeatureWithStatus[]> {
    const [definitions, overrides] = await Promise.all([
      this.featureDefRepo.find({ order: { category: 'ASC', code: 'ASC' } }),
      this.tenantFeatureRepo.find({ where: { tenantId } }),
    ]);

    const overrideMap = new Map<string, TenantFeature>(
      overrides.map((o) => [o.featureCode, o]),
    );

    return definitions.map((def): FeatureWithStatus => {
      const override = overrideMap.get(def.code);
      return {
        code: def.code,
        name: def.name,
        description: def.description,
        category: def.category,
        defaultEnabled: def.defaultEnabled,
        requiresPlan: def.requiresPlan,
        isEnabled: override !== undefined ? override.isEnabled : def.defaultEnabled,
        hasOverride: override !== undefined,
      };
    });
  }

  /**
   * Check if a specific feature is enabled for a tenant.
   * Uses Redis cache (5-min TTL) to reduce DB load.
   * Check order: cache → tenant override → feature default.
   */
  async isFeatureEnabled(tenantId: string, featureCode: string): Promise<boolean> {
    // 1. Check Redis cache first
    const cacheKey = `feature:${tenantId}:${featureCode}`;
    const cached = await this.redis.get(cacheKey);
    if (cached !== null) {
      return cached === '1';
    }

    // 2. Check tenant override
    const override = await this.tenantFeatureRepo.findOne({
      where: { tenantId, featureCode },
    });

    if (override !== null) {
      await this.redis.setex(cacheKey, this.cacheTtlSeconds, override.isEnabled ? '1' : '0');
      return override.isEnabled;
    }

    // 3. Fall back to feature definition default
    const definition = await this.featureDefRepo.findOne({
      where: { code: featureCode },
    });

    const enabled = definition?.defaultEnabled ?? false;
    await this.redis.setex(cacheKey, this.cacheTtlSeconds, enabled ? '1' : '0');
    return enabled;
  }

  /**
   * Enable or disable a feature for a specific tenant.
   * Invalidates the Redis cache and publishes an event.
   */
  async toggleFeature(
    tenantId: string,
    featureCode: string,
    dto: ToggleFeatureDto,
    toggledByUserId: string,
  ): Promise<TenantFeature> {
    // Validate feature code exists
    const definition = await this.featureDefRepo.findOne({ where: { code: featureCode } });
    if (!definition) {
      throw new NotFoundException(`Feature '${featureCode}' is not a known feature code`);
    }

    // Upsert the tenant feature override
    let tenantFeature = await this.tenantFeatureRepo.findOne({
      where: { tenantId, featureCode },
    });

    if (tenantFeature) {
      tenantFeature.isEnabled = dto.enabled;
      tenantFeature.enabledBy = toggledByUserId;
    } else {
      tenantFeature = this.tenantFeatureRepo.create({
        tenantId,
        featureCode,
        isEnabled: dto.enabled,
        enabledBy: toggledByUserId,
      });
    }

    const saved = await this.tenantFeatureRepo.save(tenantFeature);

    // Invalidate Redis cache for this tenant+feature
    const cacheKey = `feature:${tenantId}:${featureCode}`;
    await this.redis.del(cacheKey);
    this.logger.debug(`Invalidated cache key: ${cacheKey}`);

    // Publish event
    if (this.rabbitClient) {
      const event = new TenantFeatureToggledEvent({
        tenantId,
        featureCode,
        enabled: dto.enabled,
      });
      this.rabbitClient
        .emit('tenant.feature-toggled', event)
        .subscribe({
          error: (err: Error) =>
            this.logger.warn(`Failed to publish tenant.feature-toggled: ${err.message}`),
        });
    }

    this.logger.log(
      `Feature '${featureCode}' ${dto.enabled ? 'enabled' : 'disabled'} for tenant ${tenantId}`,
    );

    return saved;
  }

  /**
   * Upsert multiple features at once (used during tenant provisioning).
   */
  async bulkUpsertFeatures(
    tenantId: string,
    featureCodes: string[],
    isEnabled: boolean,
    enabledByUserId: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    manager?: any,
  ): Promise<void> {
    const repo = manager
      ? manager.getRepository(TenantFeature)
      : this.tenantFeatureRepo;

    for (const featureCode of featureCodes) {
      const existing = await repo.findOne({ where: { tenantId, featureCode } });
      if (existing) {
        existing.isEnabled = isEnabled;
        existing.enabledBy = enabledByUserId;
        await repo.save(existing);
      } else {
        await repo.save(
          repo.create({ tenantId, featureCode, isEnabled, enabledBy: enabledByUserId }),
        );
      }
    }
  }

  /**
   * Invalidate all cached features for a tenant (e.g. after plan change).
   */
  async invalidateTenantFeatureCache(tenantId: string): Promise<void> {
    const keys = await this.redis.keys(`feature:${tenantId}:*`);
    if (keys.length > 0) {
      await this.redis.del(...keys);
      this.logger.debug(`Invalidated ${keys.length} cache keys for tenant ${tenantId}`);
    }
  }
}
