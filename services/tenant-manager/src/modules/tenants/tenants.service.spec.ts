import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { TenantsService } from './tenants.service';
import { Tenant } from './entities/tenant.entity';
import { TenantFeature } from '../features/entities/tenant-feature.entity';
import { PlansService } from '../plans/plans.service';
import { FeaturesService } from '../features/features.service';
import { RabbitMqPublisherService } from '../../common/messaging/rabbitmq-publisher.service';
import { ConfigService } from '@nestjs/config';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { UpdateTenantDto, SuspendTenantDto } from './dto/update-tenant.dto';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTenant(overrides: Partial<Tenant> = {}): Tenant {
  return {
    id: 'tenant-uuid-1',
    name: 'Acme Corp',
    slug: 'acme-corp',
    status: 'active',
    adminEmail: 'admin@acme.com',
    currentPlan: 'free',
    enabledFeatures: ['basic_reporting'],
    phone: null,
    address: null,
    metadata: {},
    stripeCustomerId: null,
    trialEndsAt: null,
    suspendedAt: null,
    cancelledAt: null,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    tenantFeatures: [],
    ...overrides,
  } as Tenant;
}

function makeFreePlan() {
  return {
    id: 'plan-free',
    code: 'free',
    name: 'Free',
    description: null,
    priceMonthly: 0,
    priceYearly: null,
    stripePriceIdMonthly: null,
    stripePriceIdYearly: null,
    maxUsers: 5,
    maxUnits: 1,
    includedFeatures: ['basic_reporting'],
    isActive: true,
    sortOrder: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function makeStarterPlan() {
  return {
    ...makeFreePlan(),
    id: 'plan-starter',
    code: 'starter',
    name: 'Starter',
    includedFeatures: ['basic_reporting', 'api_access', 'webhooks'],
  };
}

// ---------------------------------------------------------------------------
// Mock factory
// ---------------------------------------------------------------------------

function buildMocks() {
  const tenantRepo = {
    findOne: jest.fn(),
    findAndCount: jest.fn(),
    save: jest.fn(),
    update: jest.fn(),
  };

  // EntityManager used inside dataSource.transaction callback
  const manager = {
    create: jest.fn(),
    save: jest.fn(),
    findOne: jest.fn(),
  };

  const dataSource = {
    transaction: jest.fn((cb: (mgr: typeof manager) => Promise<unknown>) => cb(manager)),
  };

  const plansService = {
    findByCode: jest.fn(),
  };

  const featuresService = {
    replaceTenantFeatures: jest.fn(),
    invalidateTenantFeatureCache: jest.fn(),
    isFeatureEnabled: jest.fn(),
  };

  const configService = {
    get: jest.fn(),
  };

  const rabbitMqPublisher = {
    publish: jest.fn(),
  };

  return { tenantRepo, manager, dataSource, plansService, featuresService, configService, rabbitMqPublisher };
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('TenantsService', () => {
  let service: TenantsService;
  let mocks: ReturnType<typeof buildMocks>;

  // Capture the global fetch mock
  let fetchMock: jest.Mock;

  beforeEach(async () => {
    mocks = buildMocks();

    fetchMock = jest.fn().mockResolvedValue({ ok: true });
    (global as unknown as Record<string, unknown>)['fetch'] = fetchMock;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TenantsService,
        { provide: getRepositoryToken(Tenant), useValue: mocks.tenantRepo },
        { provide: DataSource, useValue: mocks.dataSource },
        { provide: PlansService, useValue: mocks.plansService },
        { provide: FeaturesService, useValue: mocks.featuresService },
        { provide: ConfigService, useValue: mocks.configService },
        { provide: RabbitMqPublisherService, useValue: mocks.rabbitMqPublisher },
      ],
    }).compile();

    service = module.get<TenantsService>(TenantsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ─── findById ─────────────────────────────────────────────────────────────

  describe('findById', () => {
    it('returns tenant when found', async () => {
      const tenant = makeTenant();
      mocks.tenantRepo.findOne.mockResolvedValue(tenant);

      const result = await service.findById('tenant-uuid-1');

      expect(result).toBe(tenant);
      expect(mocks.tenantRepo.findOne).toHaveBeenCalledWith({ where: { id: 'tenant-uuid-1' } });
    });

    it('throws NotFoundException when tenant does not exist', async () => {
      mocks.tenantRepo.findOne.mockResolvedValue(null);

      await expect(service.findById('missing-id')).rejects.toThrow(NotFoundException);
    });
  });

  // ─── findBySlug ───────────────────────────────────────────────────────────

  describe('findBySlug', () => {
    it('returns tenant by slug', async () => {
      const tenant = makeTenant();
      mocks.tenantRepo.findOne.mockResolvedValue(tenant);

      const result = await service.findBySlug('acme-corp');

      expect(result).toBe(tenant);
    });

    it('throws NotFoundException for unknown slug', async () => {
      mocks.tenantRepo.findOne.mockResolvedValue(null);

      await expect(service.findBySlug('ghost')).rejects.toThrow(NotFoundException);
    });
  });

  // ─── createTenant ─────────────────────────────────────────────────────────

  describe('createTenant', () => {
    const dto: CreateTenantDto = {
      name: 'Acme Corp',
      adminEmail: 'Admin@Acme.com',
      plan: 'free',
    };
    const userId = 'user-uuid-1';

    function setupSuccessfulCreate() {
      const plan = makeFreePlan();
      mocks.tenantRepo.findOne.mockResolvedValue(null); // no slug collision
      mocks.plansService.findByCode.mockResolvedValue(plan);

      const provisioned = makeTenant({ status: 'active', adminEmail: 'admin@acme.com' });

      // manager.create returns a plain object; manager.save returns the entity
      mocks.manager.create.mockReturnValue(provisioned);
      mocks.manager.save.mockResolvedValue(provisioned);
      mocks.manager.findOne.mockResolvedValue(null); // no existing TenantFeature

      // No identity service configured
      mocks.configService.get.mockReturnValue(undefined);

      return provisioned;
    }

    it('returns tenant on successful creation', async () => {
      const provisioned = setupSuccessfulCreate();

      const result = await service.createTenant(dto, userId);

      expect(result).toBe(provisioned);
    });

    it('lowercases adminEmail', async () => {
      setupSuccessfulCreate();

      await service.createTenant(dto, userId);

      // The create call on the manager should receive lower-cased email
      expect(mocks.manager.create).toHaveBeenCalledWith(
        Tenant,
        expect.objectContaining({ adminEmail: 'admin@acme.com' }),
      );
    });

    it('generates a unique slug when base slug already exists', async () => {
      const plan = makeFreePlan();
      // First findOne (slug collision check) returns existing tenant
      mocks.tenantRepo.findOne.mockResolvedValue(makeTenant({ slug: 'acme-corp' }));
      mocks.plansService.findByCode.mockResolvedValue(plan);

      const provisioned = makeTenant();
      mocks.manager.create.mockReturnValue(provisioned);
      mocks.manager.save.mockResolvedValue(provisioned);
      mocks.manager.findOne.mockResolvedValue(null);
      mocks.configService.get.mockReturnValue(undefined);

      await service.createTenant(dto, userId);

      // The slug passed to manager.create should have a suffix appended
      const createCall = mocks.manager.create.mock.calls.find((c: unknown[]) => c[0] === Tenant);
      expect(createCall).toBeDefined();
      const createdObj = createCall![1] as { slug: string };
      expect(createdObj.slug).toMatch(/^acme-corp-[a-f0-9]{4}$/);
    });

    it('publishes tenant.provisioned event after creation', async () => {
      const provisioned = setupSuccessfulCreate();

      await service.createTenant(dto, userId);

      expect(mocks.rabbitMqPublisher.publish).toHaveBeenCalledWith(
        'chassis.tenants',
        'tenant.provisioned',
        expect.objectContaining({ tenantId: provisioned.id }),
      );
    });

    it('calls identity service membership endpoint when configured', async () => {
      setupSuccessfulCreate();
      mocks.configService.get
        .mockImplementation((key: string) => {
          if (key === 'app.identityServiceUrl') return 'http://identity:3000';
          if (key === 'app.internalServiceToken') return 'secret-token';
          return undefined;
        });

      await service.createTenant(dto, userId);

      expect(fetchMock).toHaveBeenCalledWith(
        'http://identity:3000/api/v1/memberships',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'X-Service-Token': 'secret-token',
          }),
          body: expect.stringContaining(userId),
        }),
      );
    });

    it('does not call identity service when URL is not configured', async () => {
      setupSuccessfulCreate();
      mocks.configService.get.mockReturnValue(undefined);

      await service.createTenant(dto, userId);

      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('still returns tenant when identity service call fails (fire-and-forget)', async () => {
      setupSuccessfulCreate();
      mocks.configService.get
        .mockImplementation((key: string) => {
          if (key === 'app.identityServiceUrl') return 'http://identity:3000';
          if (key === 'app.internalServiceToken') return 'secret';
          return undefined;
        });
      fetchMock.mockRejectedValue(new Error('connection refused'));

      // Should not throw
      await expect(service.createTenant(dto, userId)).resolves.toBeDefined();
    });

    it('uses free plan when dto.plan is omitted', async () => {
      const plan = makeFreePlan();
      mocks.tenantRepo.findOne.mockResolvedValue(null);
      mocks.plansService.findByCode.mockResolvedValue(plan);
      const provisioned = makeTenant();
      mocks.manager.create.mockReturnValue(provisioned);
      mocks.manager.save.mockResolvedValue(provisioned);
      mocks.manager.findOne.mockResolvedValue(null);
      mocks.configService.get.mockReturnValue(undefined);

      const dtoWithoutPlan: CreateTenantDto = { name: 'Acme Corp', adminEmail: 'a@b.com' };
      await service.createTenant(dtoWithoutPlan, userId);

      expect(mocks.plansService.findByCode).toHaveBeenCalledWith('free');
    });
  });

  // ─── updateTenant ─────────────────────────────────────────────────────────

  describe('updateTenant', () => {
    it('updates simple fields and saves', async () => {
      const tenant = makeTenant();
      mocks.tenantRepo.findOne.mockResolvedValue(tenant);
      const updated = makeTenant({ name: 'New Name' });
      mocks.tenantRepo.save.mockResolvedValue(updated);

      const dto: UpdateTenantDto = { name: 'New Name' };
      const result = await service.updateTenant('tenant-uuid-1', dto);

      expect(result).toBe(updated);
      expect(mocks.tenantRepo.save).toHaveBeenCalledWith(expect.objectContaining({ name: 'New Name' }));
    });

    it('lowercases adminEmail on update', async () => {
      const tenant = makeTenant();
      mocks.tenantRepo.findOne.mockResolvedValue(tenant);
      mocks.tenantRepo.save.mockResolvedValue(tenant);

      await service.updateTenant('tenant-uuid-1', { adminEmail: 'New@Admin.COM' });

      expect(mocks.tenantRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ adminEmail: 'new@admin.com' }),
      );
    });

    it('syncs tenant_features when plan changes (TM-2 fix)', async () => {
      const tenant = makeTenant({ currentPlan: 'free' });
      mocks.tenantRepo.findOne.mockResolvedValue(tenant);
      const newPlan = makeStarterPlan();
      mocks.plansService.findByCode.mockResolvedValue(newPlan);
      const saved = makeTenant({ currentPlan: 'starter' });
      mocks.tenantRepo.save.mockResolvedValue(saved);
      mocks.featuresService.replaceTenantFeatures.mockResolvedValue(undefined);
      mocks.featuresService.invalidateTenantFeatureCache.mockResolvedValue(undefined);

      await service.updateTenant('tenant-uuid-1', { plan: 'starter' });

      expect(mocks.featuresService.replaceTenantFeatures).toHaveBeenCalledWith(
        'tenant-uuid-1',
        ['basic_reporting', 'api_access', 'webhooks'],
        'tenant-uuid-1',
      );
    });

    it('invalidates feature cache on plan change', async () => {
      const tenant = makeTenant({ currentPlan: 'free' });
      mocks.tenantRepo.findOne.mockResolvedValue(tenant);
      mocks.plansService.findByCode.mockResolvedValue(makeStarterPlan());
      mocks.tenantRepo.save.mockResolvedValue(tenant);
      mocks.featuresService.replaceTenantFeatures.mockResolvedValue(undefined);
      mocks.featuresService.invalidateTenantFeatureCache.mockResolvedValue(undefined);

      await service.updateTenant('tenant-uuid-1', { plan: 'starter' });

      expect(mocks.featuresService.invalidateTenantFeatureCache).toHaveBeenCalledWith('tenant-uuid-1');
    });

    it('publishes tenant.plan-changed event on plan change', async () => {
      const tenant = makeTenant({ currentPlan: 'free' });
      mocks.tenantRepo.findOne.mockResolvedValue(tenant);
      mocks.plansService.findByCode.mockResolvedValue(makeStarterPlan());
      mocks.tenantRepo.save.mockResolvedValue(tenant);
      mocks.featuresService.replaceTenantFeatures.mockResolvedValue(undefined);
      mocks.featuresService.invalidateTenantFeatureCache.mockResolvedValue(undefined);

      await service.updateTenant('tenant-uuid-1', { plan: 'starter' });

      expect(mocks.rabbitMqPublisher.publish).toHaveBeenCalledWith(
        'chassis.tenants',
        'tenant.plan-changed',
        expect.objectContaining({ tenantId: 'tenant-uuid-1', oldPlan: 'free', newPlan: 'starter' }),
      );
    });

    it('does not sync features when plan is unchanged', async () => {
      const tenant = makeTenant({ currentPlan: 'free' });
      mocks.tenantRepo.findOne.mockResolvedValue(tenant);
      mocks.tenantRepo.save.mockResolvedValue(tenant);

      // plan field is the same as current
      await service.updateTenant('tenant-uuid-1', { plan: 'free' });

      expect(mocks.featuresService.replaceTenantFeatures).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when tenant does not exist', async () => {
      mocks.tenantRepo.findOne.mockResolvedValue(null);

      await expect(service.updateTenant('missing', {})).rejects.toThrow(NotFoundException);
    });
  });

  // ─── suspendTenant ────────────────────────────────────────────────────────

  describe('suspendTenant', () => {
    it('sets status to suspended and saves', async () => {
      const tenant = makeTenant({ status: 'active' });
      mocks.tenantRepo.findOne.mockResolvedValue(tenant);
      const saved = makeTenant({ status: 'suspended' });
      mocks.tenantRepo.save.mockResolvedValue(saved);

      const dto: SuspendTenantDto = { reason: 'non-payment' };
      const result = await service.suspendTenant('tenant-uuid-1', dto);

      expect(result.status).toBe('suspended');
      expect(mocks.tenantRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'suspended' }),
      );
    });

    it('publishes tenant.suspended event', async () => {
      const tenant = makeTenant({ status: 'active' });
      mocks.tenantRepo.findOne.mockResolvedValue(tenant);
      mocks.tenantRepo.save.mockResolvedValue(makeTenant({ status: 'suspended' }));

      await service.suspendTenant('tenant-uuid-1', { reason: 'non-payment' });

      expect(mocks.rabbitMqPublisher.publish).toHaveBeenCalledWith(
        'chassis.tenants',
        'tenant.suspended',
        expect.objectContaining({ tenantId: 'tenant-uuid-1', reason: 'non-payment' }),
      );
    });

    it('throws BadRequestException when already suspended', async () => {
      mocks.tenantRepo.findOne.mockResolvedValue(makeTenant({ status: 'suspended' }));

      await expect(service.suspendTenant('tenant-uuid-1', {})).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when tenant is cancelled', async () => {
      mocks.tenantRepo.findOne.mockResolvedValue(makeTenant({ status: 'cancelled' }));

      await expect(service.suspendTenant('tenant-uuid-1', {})).rejects.toThrow(BadRequestException);
    });

    it('throws NotFoundException when tenant does not exist', async () => {
      mocks.tenantRepo.findOne.mockResolvedValue(null);

      await expect(service.suspendTenant('missing', {})).rejects.toThrow(NotFoundException);
    });
  });

  // ─── activateTenant ───────────────────────────────────────────────────────

  describe('activateTenant', () => {
    it('sets status to active', async () => {
      const tenant = makeTenant({ status: 'suspended' });
      mocks.tenantRepo.findOne.mockResolvedValue(tenant);
      const saved = makeTenant({ status: 'active', suspendedAt: null });
      mocks.tenantRepo.save.mockResolvedValue(saved);

      const result = await service.activateTenant('tenant-uuid-1');

      expect(result.status).toBe('active');
    });

    it('throws BadRequestException when already active', async () => {
      mocks.tenantRepo.findOne.mockResolvedValue(makeTenant({ status: 'active' }));

      await expect(service.activateTenant('tenant-uuid-1')).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when cancelled', async () => {
      mocks.tenantRepo.findOne.mockResolvedValue(makeTenant({ status: 'cancelled' }));

      await expect(service.activateTenant('tenant-uuid-1')).rejects.toThrow(BadRequestException);
    });
  });

  // ─── archiveTenant ────────────────────────────────────────────────────────

  describe('archiveTenant', () => {
    it('sets status to cancelled', async () => {
      const tenant = makeTenant({ status: 'active' });
      mocks.tenantRepo.findOne.mockResolvedValue(tenant);
      mocks.tenantRepo.save.mockResolvedValue(makeTenant({ status: 'cancelled' }));
      mocks.featuresService.invalidateTenantFeatureCache.mockResolvedValue(undefined);

      await service.archiveTenant('tenant-uuid-1');

      expect(mocks.tenantRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'cancelled' }),
      );
    });

    it('invalidates feature cache on archive', async () => {
      mocks.tenantRepo.findOne.mockResolvedValue(makeTenant({ status: 'active' }));
      mocks.tenantRepo.save.mockResolvedValue(makeTenant({ status: 'cancelled' }));
      mocks.featuresService.invalidateTenantFeatureCache.mockResolvedValue(undefined);

      await service.archiveTenant('tenant-uuid-1');

      expect(mocks.featuresService.invalidateTenantFeatureCache).toHaveBeenCalledWith('tenant-uuid-1');
    });

    it('throws BadRequestException when already cancelled', async () => {
      mocks.tenantRepo.findOne.mockResolvedValue(makeTenant({ status: 'cancelled' }));

      await expect(service.archiveTenant('tenant-uuid-1')).rejects.toThrow(BadRequestException);
    });
  });

  // ─── findAll ──────────────────────────────────────────────────────────────

  describe('findAll', () => {
    it('returns paginated tenants', async () => {
      const tenants = [makeTenant()];
      mocks.tenantRepo.findAndCount.mockResolvedValue([tenants, 1]);

      const result = await service.findAll(1, 10);

      expect(result).toEqual({ items: tenants, total: 1, page: 1, limit: 10 });
      expect(mocks.tenantRepo.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 0, take: 10 }),
      );
    });

    it('uses defaults page=1 limit=20', async () => {
      mocks.tenantRepo.findAndCount.mockResolvedValue([[], 0]);

      const result = await service.findAll();

      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
    });
  });

  // ─── handleBillingSynced ──────────────────────────────────────────────────

  describe('handleBillingSynced', () => {
    it('updates stripeCustomerId', async () => {
      mocks.tenantRepo.update.mockResolvedValue({ affected: 1 });

      await service.handleBillingSynced({ tenantId: 'tenant-uuid-1', stripeCustomerId: 'cus_123' });

      expect(mocks.tenantRepo.update).toHaveBeenCalledWith('tenant-uuid-1', {
        stripeCustomerId: 'cus_123',
      });
    });
  });

  // ─── handleSubscriptionStatus ─────────────────────────────────────────────

  describe('handleSubscriptionStatus', () => {
    it('activates tenant on active status', async () => {
      const tenant = makeTenant({ status: 'suspended' });
      mocks.tenantRepo.findOne.mockResolvedValue(tenant);
      mocks.tenantRepo.save.mockResolvedValue({ ...tenant, status: 'active' });

      await service.handleSubscriptionStatus({ tenantId: 'tenant-uuid-1', status: 'active' });

      expect(mocks.tenantRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'active', suspendedAt: null }),
      );
    });

    it('suspends tenant on past_due status', async () => {
      const tenant = makeTenant({ status: 'active' });
      mocks.tenantRepo.findOne.mockResolvedValue(tenant);
      mocks.tenantRepo.save.mockResolvedValue({ ...tenant, status: 'suspended' });

      await service.handleSubscriptionStatus({ tenantId: 'tenant-uuid-1', status: 'past_due' });

      expect(mocks.tenantRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'suspended' }),
      );
    });

    it('cancels tenant on cancelled status', async () => {
      const tenant = makeTenant({ status: 'active' });
      mocks.tenantRepo.findOne.mockResolvedValue(tenant);
      mocks.tenantRepo.save.mockResolvedValue({ ...tenant, status: 'cancelled' });

      await service.handleSubscriptionStatus({ tenantId: 'tenant-uuid-1', status: 'cancelled' });

      expect(mocks.tenantRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'cancelled' }),
      );
    });

    it('does nothing when tenant is unknown', async () => {
      mocks.tenantRepo.findOne.mockResolvedValue(null);

      await service.handleSubscriptionStatus({ tenantId: 'ghost', status: 'active' });

      expect(mocks.tenantRepo.save).not.toHaveBeenCalled();
    });

    it('updates plan when plan differs', async () => {
      const tenant = makeTenant({ currentPlan: 'free' });
      mocks.tenantRepo.findOne.mockResolvedValue(tenant);
      mocks.tenantRepo.save.mockResolvedValue({ ...tenant, currentPlan: 'starter' });

      await service.handleSubscriptionStatus({
        tenantId: 'tenant-uuid-1',
        status: 'active',
        plan: 'starter',
      });

      expect(mocks.tenantRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ currentPlan: 'starter' }),
      );
    });
  });
});
