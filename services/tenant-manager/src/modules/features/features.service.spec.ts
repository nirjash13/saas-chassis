import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { FeaturesService } from './features.service';
import { FeatureDefinition } from './entities/feature-definition.entity';
import { TenantFeature } from './entities/tenant-feature.entity';
import { RabbitMqPublisherService } from '../../common/messaging/rabbitmq-publisher.service';
import { ToggleFeatureDto } from './dto/toggle-feature.dto';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeDefinition(overrides: Partial<FeatureDefinition> = {}): FeatureDefinition {
  return {
    id: 'def-uuid-1',
    code: 'api_access',
    name: 'API Access',
    description: null,
    category: 'core',
    defaultEnabled: false,
    requiresPlan: null,
    createdAt: new Date(),
    tenantFeatures: [],
    ...overrides,
  } as FeatureDefinition;
}

function makeTenantFeature(overrides: Partial<TenantFeature> = {}): TenantFeature {
  return {
    id: 'tf-uuid-1',
    tenantId: 'tenant-uuid-1',
    featureCode: 'api_access',
    isEnabled: true,
    enabledBy: 'user-uuid-1',
    enabledAt: new Date(),
    tenant: {} as never,
    featureDefinition: {} as never,
    ...overrides,
  } as TenantFeature;
}

// ---------------------------------------------------------------------------
// Mock factory
// ---------------------------------------------------------------------------

function buildMocks() {
  const featureDefRepo = {
    find: jest.fn(),
    findOne: jest.fn(),
  };

  const tenantFeatureRepo = {
    find: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    delete: jest.fn(),
  };

  // Minimal Redis mock
  const redis = {
    get: jest.fn(),
    setex: jest.fn(),
    del: jest.fn(),
    scan: jest.fn(),
  };

  const rabbitMqPublisher = {
    publish: jest.fn(),
  };

  return { featureDefRepo, tenantFeatureRepo, redis, rabbitMqPublisher };
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('FeaturesService', () => {
  let service: FeaturesService;
  let mocks: ReturnType<typeof buildMocks>;

  beforeEach(async () => {
    mocks = buildMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FeaturesService,
        { provide: getRepositoryToken(FeatureDefinition), useValue: mocks.featureDefRepo },
        { provide: getRepositoryToken(TenantFeature), useValue: mocks.tenantFeatureRepo },
        { provide: 'REDIS_CLIENT', useValue: mocks.redis },
        { provide: RabbitMqPublisherService, useValue: mocks.rabbitMqPublisher },
      ],
    }).compile();

    service = module.get<FeaturesService>(FeaturesService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ─── findDefinitionByCode ─────────────────────────────────────────────────

  describe('findDefinitionByCode', () => {
    it('returns feature definition when found', async () => {
      const def = makeDefinition();
      mocks.featureDefRepo.findOne.mockResolvedValue(def);

      const result = await service.findDefinitionByCode('api_access');

      expect(result).toBe(def);
    });

    it('throws NotFoundException for unknown code', async () => {
      mocks.featureDefRepo.findOne.mockResolvedValue(null);

      await expect(service.findDefinitionByCode('ghost')).rejects.toThrow(NotFoundException);
    });
  });

  // ─── isFeatureEnabled ─────────────────────────────────────────────────────

  describe('isFeatureEnabled', () => {
    const tenantId = 'tenant-uuid-1';
    const featureCode = 'api_access';
    const cacheKey = `feature:${tenantId}:${featureCode}`;

    it('returns true from Redis cache when cached value is "1"', async () => {
      mocks.redis.get.mockResolvedValue('1');

      const result = await service.isFeatureEnabled(tenantId, featureCode);

      expect(result).toBe(true);
      expect(mocks.redis.get).toHaveBeenCalledWith(cacheKey);
      // Should not hit the DB
      expect(mocks.tenantFeatureRepo.findOne).not.toHaveBeenCalled();
    });

    it('returns false from Redis cache when cached value is "0"', async () => {
      mocks.redis.get.mockResolvedValue('0');

      const result = await service.isFeatureEnabled(tenantId, featureCode);

      expect(result).toBe(false);
      expect(mocks.tenantFeatureRepo.findOne).not.toHaveBeenCalled();
    });

    it('returns tenant override value and writes to cache when cache misses', async () => {
      mocks.redis.get.mockResolvedValue(null); // cache miss
      const override = makeTenantFeature({ isEnabled: true });
      mocks.tenantFeatureRepo.findOne.mockResolvedValue(override);
      mocks.redis.setex.mockResolvedValue('OK');

      const result = await service.isFeatureEnabled(tenantId, featureCode);

      expect(result).toBe(true);
      expect(mocks.redis.setex).toHaveBeenCalledWith(cacheKey, 300, '1');
    });

    it('returns disabled override and writes "0" to cache', async () => {
      mocks.redis.get.mockResolvedValue(null);
      const override = makeTenantFeature({ isEnabled: false });
      mocks.tenantFeatureRepo.findOne.mockResolvedValue(override);
      mocks.redis.setex.mockResolvedValue('OK');

      const result = await service.isFeatureEnabled(tenantId, featureCode);

      expect(result).toBe(false);
      expect(mocks.redis.setex).toHaveBeenCalledWith(cacheKey, 300, '0');
    });

    it('falls back to feature default when no override exists', async () => {
      mocks.redis.get.mockResolvedValue(null);
      mocks.tenantFeatureRepo.findOne.mockResolvedValue(null);
      const def = makeDefinition({ defaultEnabled: true });
      mocks.featureDefRepo.findOne.mockResolvedValue(def);
      mocks.redis.setex.mockResolvedValue('OK');

      const result = await service.isFeatureEnabled(tenantId, featureCode);

      expect(result).toBe(true);
      expect(mocks.redis.setex).toHaveBeenCalledWith(cacheKey, 300, '1');
    });

    it('returns false when no override and no definition found', async () => {
      mocks.redis.get.mockResolvedValue(null);
      mocks.tenantFeatureRepo.findOne.mockResolvedValue(null);
      mocks.featureDefRepo.findOne.mockResolvedValue(null);
      mocks.redis.setex.mockResolvedValue('OK');

      const result = await service.isFeatureEnabled(tenantId, 'unknown_feature');

      expect(result).toBe(false);
    });
  });

  // ─── toggleFeature ────────────────────────────────────────────────────────

  describe('toggleFeature', () => {
    const tenantId = 'tenant-uuid-1';
    const featureCode = 'api_access';
    const userId = 'user-uuid-1';

    it('throws NotFoundException when feature code does not exist', async () => {
      mocks.featureDefRepo.findOne.mockResolvedValue(null);

      const dto: ToggleFeatureDto = { enabled: true };
      await expect(service.toggleFeature(tenantId, featureCode, dto, userId)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('updates existing tenant feature override', async () => {
      const def = makeDefinition();
      mocks.featureDefRepo.findOne.mockResolvedValue(def);
      const existing = makeTenantFeature({ isEnabled: false });
      mocks.tenantFeatureRepo.findOne.mockResolvedValue(existing);
      const saved = makeTenantFeature({ isEnabled: true });
      mocks.tenantFeatureRepo.save.mockResolvedValue(saved);
      mocks.redis.del.mockResolvedValue(1);

      const dto: ToggleFeatureDto = { enabled: true };
      const result = await service.toggleFeature(tenantId, featureCode, dto, userId);

      expect(result).toBe(saved);
      expect(existing.isEnabled).toBe(true);
      expect(existing.enabledBy).toBe(userId);
    });

    it('creates new tenant feature override when none exists', async () => {
      const def = makeDefinition();
      mocks.featureDefRepo.findOne.mockResolvedValue(def);
      mocks.tenantFeatureRepo.findOne.mockResolvedValue(null);
      const newFeature = makeTenantFeature();
      mocks.tenantFeatureRepo.create.mockReturnValue(newFeature);
      mocks.tenantFeatureRepo.save.mockResolvedValue(newFeature);
      mocks.redis.del.mockResolvedValue(1);

      const dto: ToggleFeatureDto = { enabled: true };
      const result = await service.toggleFeature(tenantId, featureCode, dto, userId);

      expect(result).toBe(newFeature);
      expect(mocks.tenantFeatureRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ tenantId, featureCode, isEnabled: true, enabledBy: userId }),
      );
    });

    it('invalidates Redis cache for the toggled feature', async () => {
      mocks.featureDefRepo.findOne.mockResolvedValue(makeDefinition());
      mocks.tenantFeatureRepo.findOne.mockResolvedValue(null);
      mocks.tenantFeatureRepo.create.mockReturnValue(makeTenantFeature());
      mocks.tenantFeatureRepo.save.mockResolvedValue(makeTenantFeature());
      mocks.redis.del.mockResolvedValue(1);

      await service.toggleFeature(tenantId, featureCode, { enabled: true }, userId);

      expect(mocks.redis.del).toHaveBeenCalledWith(`feature:${tenantId}:${featureCode}`);
    });

    it('publishes tenant.feature-toggled event', async () => {
      mocks.featureDefRepo.findOne.mockResolvedValue(makeDefinition());
      mocks.tenantFeatureRepo.findOne.mockResolvedValue(null);
      mocks.tenantFeatureRepo.create.mockReturnValue(makeTenantFeature());
      mocks.tenantFeatureRepo.save.mockResolvedValue(makeTenantFeature());
      mocks.redis.del.mockResolvedValue(1);

      await service.toggleFeature(tenantId, featureCode, { enabled: false }, userId);

      expect(mocks.rabbitMqPublisher.publish).toHaveBeenCalledWith(
        'chassis.tenants',
        'tenant.feature-toggled',
        expect.objectContaining({ tenantId, featureCode, enabled: false }),
      );
    });
  });

  // ─── replaceTenantFeatures ────────────────────────────────────────────────

  describe('replaceTenantFeatures', () => {
    const tenantId = 'tenant-uuid-1';
    const userId = 'user-uuid-1';

    it('deletes existing tenant features before inserting new ones', async () => {
      mocks.tenantFeatureRepo.delete.mockResolvedValue({ affected: 3 });
      mocks.tenantFeatureRepo.create.mockImplementation((dto: Partial<TenantFeature>) => dto);
      mocks.tenantFeatureRepo.save.mockResolvedValue({});

      await service.replaceTenantFeatures(tenantId, ['api_access', 'webhooks'], userId);

      expect(mocks.tenantFeatureRepo.delete).toHaveBeenCalledWith({ tenantId });
    });

    it('inserts one row per feature code', async () => {
      mocks.tenantFeatureRepo.delete.mockResolvedValue({ affected: 0 });
      mocks.tenantFeatureRepo.create.mockImplementation((dto: Partial<TenantFeature>) => dto);
      mocks.tenantFeatureRepo.save.mockResolvedValue({});

      await service.replaceTenantFeatures(tenantId, ['api_access', 'webhooks'], userId);

      expect(mocks.tenantFeatureRepo.save).toHaveBeenCalledTimes(2);
      expect(mocks.tenantFeatureRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ tenantId, featureCode: 'api_access', isEnabled: true }),
      );
      expect(mocks.tenantFeatureRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ tenantId, featureCode: 'webhooks', isEnabled: true }),
      );
    });

    it('handles empty feature code list (deletes all, inserts none)', async () => {
      mocks.tenantFeatureRepo.delete.mockResolvedValue({ affected: 2 });

      await service.replaceTenantFeatures(tenantId, [], userId);

      expect(mocks.tenantFeatureRepo.delete).toHaveBeenCalledWith({ tenantId });
      expect(mocks.tenantFeatureRepo.save).not.toHaveBeenCalled();
    });
  });

  // ─── invalidateTenantFeatureCache ─────────────────────────────────────────

  describe('invalidateTenantFeatureCache', () => {
    it('scans and deletes matching cache keys', async () => {
      // Return cursor=0 (single scan page) with two keys
      mocks.redis.scan.mockResolvedValue(['0', ['feature:t1:api_access', 'feature:t1:webhooks']]);
      mocks.redis.del.mockResolvedValue(2);

      await service.invalidateTenantFeatureCache('t1');

      expect(mocks.redis.scan).toHaveBeenCalledWith(0, 'MATCH', 'feature:t1:*', 'COUNT', 100);
      expect(mocks.redis.del).toHaveBeenCalledWith('feature:t1:api_access', 'feature:t1:webhooks');
    });

    it('does not call del when no matching keys found', async () => {
      mocks.redis.scan.mockResolvedValue(['0', []]);

      await service.invalidateTenantFeatureCache('t1');

      expect(mocks.redis.del).not.toHaveBeenCalled();
    });
  });

  // ─── findTenantFeatures ───────────────────────────────────────────────────

  describe('findTenantFeatures', () => {
    it('merges definition defaults with tenant overrides', async () => {
      const defs = [
        makeDefinition({ code: 'api_access', defaultEnabled: false }),
        makeDefinition({ id: 'def-2', code: 'webhooks', defaultEnabled: true }),
      ];
      const overrides = [makeTenantFeature({ featureCode: 'api_access', isEnabled: true })];

      mocks.featureDefRepo.find.mockResolvedValue(defs);
      mocks.tenantFeatureRepo.find.mockResolvedValue(overrides);

      const result = await service.findTenantFeatures('tenant-uuid-1');

      expect(result).toHaveLength(2);

      const apiAccess = result.find((f) => f.code === 'api_access')!;
      expect(apiAccess.isEnabled).toBe(true);   // overridden to true
      expect(apiAccess.hasOverride).toBe(true);

      const webhooks = result.find((f) => f.code === 'webhooks')!;
      expect(webhooks.isEnabled).toBe(true);    // falls back to defaultEnabled
      expect(webhooks.hasOverride).toBe(false);
    });
  });

  // ─── findAllDefinitions ───────────────────────────────────────────────────

  describe('findAllDefinitions', () => {
    it('returns all definitions ordered by category and code', async () => {
      const defs = [makeDefinition()];
      mocks.featureDefRepo.find.mockResolvedValue(defs);

      const result = await service.findAllDefinitions();

      expect(result).toBe(defs);
      expect(mocks.featureDefRepo.find).toHaveBeenCalledWith({
        order: { category: 'ASC', code: 'ASC' },
      });
    });
  });
});
