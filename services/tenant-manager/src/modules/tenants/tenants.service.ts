import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { ClientProxy } from '@nestjs/microservices';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const slugify = require('slugify') as (str: string, opts?: Record<string, unknown>) => string;
import { v4 as uuidv4 } from 'uuid';
import { Tenant } from './entities/tenant.entity';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { UpdateTenantDto, SuspendTenantDto } from './dto/update-tenant.dto';
import { TenantFeature } from '../features/entities/tenant-feature.entity';
import { PlansService } from '../plans/plans.service';
import { FeaturesService } from '../features/features.service';
import {
  TenantProvisionedEvent,
  TenantSuspendedEvent,
  TenantPlanChangedEvent,
} from './events/tenant-provisioned.event';

export interface PaginatedTenants {
  items: Tenant[];
  total: number;
  page: number;
  limit: number;
}

@Injectable()
export class TenantsService {
  private readonly logger = new Logger(TenantsService.name);

  constructor(
    @InjectRepository(Tenant)
    private readonly tenantRepo: Repository<Tenant>,
    private readonly dataSource: DataSource,
    private readonly plansService: PlansService,
    private readonly featuresService: FeaturesService,
    @Optional() @Inject('RABBITMQ_CLIENT') private readonly rabbitClient: ClientProxy | null,
  ) {}

  // ─── Read Operations ─────────────────────────────────────────────────────

  async findAll(page = 1, limit = 20): Promise<PaginatedTenants> {
    const [items, total] = await this.tenantRepo.findAndCount({
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { items, total, page, limit };
  }

  async findById(id: string): Promise<Tenant> {
    const tenant = await this.tenantRepo.findOne({ where: { id } });
    if (!tenant) {
      throw new NotFoundException(`Tenant with ID ${id} not found`);
    }
    return tenant;
  }

  async findBySlug(slug: string): Promise<Tenant> {
    const tenant = await this.tenantRepo.findOne({ where: { slug } });
    if (!tenant) {
      throw new NotFoundException(`Tenant with slug '${slug}' not found`);
    }
    return tenant;
  }

  // ─── Tenant Provisioning ─────────────────────────────────────────────────

  /**
   * Full transactional tenant provisioning workflow:
   * 1. Generate a unique slug from the tenant name
   * 2. Create the tenant record with status 'provisioning'
   * 3. Auto-enable features based on the selected plan
   * 4. Mark tenant as 'active'
   * 5. Publish tenant.provisioned event (outside the transaction)
   */
  async createTenant(dto: CreateTenantDto, createdByUserId: string): Promise<Tenant> {
    // Generate slug from name
    const baseSlug = slugify(dto.name, { lower: true, strict: true });

    // Ensure slug uniqueness — append short random suffix on collision
    const existingSlug = await this.tenantRepo.findOne({ where: { slug: baseSlug } });
    const finalSlug = existingSlug
      ? `${baseSlug}-${uuidv4().substring(0, 4)}`
      : baseSlug;

    // Resolve plan
    const planCode = dto.plan ?? 'free';
    const plan = await this.plansService.findByCode(planCode);

    // Transactional provisioning
    const savedTenant = await this.dataSource.transaction(async (manager) => {
      // 3a. Create tenant record
      const tenant = manager.create(Tenant, {
        name: dto.name,
        slug: finalSlug,
        adminEmail: dto.adminEmail.toLowerCase(),
        status: 'provisioning' as const,
        currentPlan: planCode,
        phone: dto.phone ?? null,
        address: dto.address ?? null,
        metadata: dto.metadata ?? {},
        stripeCustomerId: dto.stripeCustomerId ?? null,
        trialEndsAt: dto.trialEndsAt ? new Date(dto.trialEndsAt) : null,
        enabledFeatures: [],
      });
      const provisioned = await manager.save(Tenant, tenant);

      // 3b. Auto-enable features based on plan
      const featureCodes: string[] = Array.isArray(plan.includedFeatures)
        ? plan.includedFeatures
        : (plan.includedFeatures as unknown as string[]);

      for (const code of featureCodes) {
        const existing = await manager.findOne(TenantFeature, {
          where: { tenantId: provisioned.id, featureCode: code },
        });
        if (!existing) {
          await manager.save(
            manager.create(TenantFeature, {
              tenantId: provisioned.id,
              featureCode: code,
              isEnabled: true,
              enabledBy: createdByUserId,
            }),
          );
        }
      }

      // 3c. Update the denormalized enabled_features snapshot
      provisioned.enabledFeatures = featureCodes;

      // 3d. Set status to active
      provisioned.status = 'active';
      await manager.save(Tenant, provisioned);

      return provisioned;
    });

    // 4. Publish event outside the transaction
    if (this.rabbitClient) {
      const event = new TenantProvisionedEvent({
        tenantId: savedTenant.id,
        slug: savedTenant.slug,
        plan: savedTenant.currentPlan,
        adminEmail: savedTenant.adminEmail,
      });
      this.rabbitClient
        .emit('tenant.provisioned', event)
        .subscribe({
          error: (err: Error) =>
            this.logger.warn(`Failed to publish tenant.provisioned: ${err.message}`),
        });
    }

    this.logger.log(`Provisioned tenant ${savedTenant.id} (${savedTenant.slug}) on plan ${planCode}`);
    return savedTenant;
  }

  // ─── Update ──────────────────────────────────────────────────────────────

  async updateTenant(id: string, dto: UpdateTenantDto): Promise<Tenant> {
    const tenant = await this.findById(id);
    const oldPlan = tenant.currentPlan;

    if (dto.name !== undefined) tenant.name = dto.name;
    if (dto.adminEmail !== undefined) tenant.adminEmail = dto.adminEmail.toLowerCase();
    if (dto.phone !== undefined) tenant.phone = dto.phone ?? null;
    if (dto.address !== undefined) tenant.address = dto.address ?? null;
    if (dto.metadata !== undefined) tenant.metadata = dto.metadata;
    if (dto.stripeCustomerId !== undefined) tenant.stripeCustomerId = dto.stripeCustomerId ?? null;

    // Handle plan change
    if (dto.plan !== undefined && dto.plan !== oldPlan) {
      const newPlan = await this.plansService.findByCode(dto.plan);
      tenant.currentPlan = dto.plan;

      // Update the enabled_features snapshot for the new plan
      const featureCodes: string[] = Array.isArray(newPlan.includedFeatures)
        ? newPlan.includedFeatures
        : (newPlan.includedFeatures as unknown as string[]);
      tenant.enabledFeatures = featureCodes;

      const saved = await this.tenantRepo.save(tenant);

      // Invalidate all cached features for this tenant
      await this.featuresService.invalidateTenantFeatureCache(id);

      // Publish plan-changed event
      if (this.rabbitClient) {
        const event = new TenantPlanChangedEvent({
          tenantId: id,
          oldPlan,
          newPlan: dto.plan,
        });
        this.rabbitClient
          .emit('tenant.plan-changed', event)
          .subscribe({
            error: (err: Error) =>
              this.logger.warn(`Failed to publish tenant.plan-changed: ${err.message}`),
          });
      }

      return saved;
    }

    return this.tenantRepo.save(tenant);
  }

  // ─── Lifecycle Operations ─────────────────────────────────────────────────

  async suspendTenant(id: string, dto: SuspendTenantDto): Promise<Tenant> {
    const tenant = await this.findById(id);

    if (tenant.status === 'suspended') {
      throw new BadRequestException('Tenant is already suspended');
    }
    if (tenant.status === 'cancelled') {
      throw new BadRequestException('Cannot suspend a cancelled tenant');
    }

    tenant.status = 'suspended';
    tenant.suspendedAt = new Date();
    const saved = await this.tenantRepo.save(tenant);

    if (this.rabbitClient) {
      const event = new TenantSuspendedEvent({ tenantId: id, reason: dto.reason });
      this.rabbitClient
        .emit('tenant.suspended', event)
        .subscribe({
          error: (err: Error) =>
            this.logger.warn(`Failed to publish tenant.suspended: ${err.message}`),
        });
    }

    this.logger.log(`Suspended tenant ${id}${dto.reason ? ` — reason: ${dto.reason}` : ''}`);
    return saved;
  }

  async activateTenant(id: string): Promise<Tenant> {
    const tenant = await this.findById(id);

    if (tenant.status === 'active') {
      throw new BadRequestException('Tenant is already active');
    }
    if (tenant.status === 'cancelled') {
      throw new BadRequestException('Cannot activate a cancelled tenant');
    }

    tenant.status = 'active';
    tenant.suspendedAt = null;
    const saved = await this.tenantRepo.save(tenant);

    this.logger.log(`Activated tenant ${id}`);
    return saved;
  }

  async archiveTenant(id: string): Promise<void> {
    const tenant = await this.findById(id);

    if (tenant.status === 'cancelled') {
      throw new BadRequestException('Tenant is already archived/cancelled');
    }

    tenant.status = 'cancelled';
    tenant.cancelledAt = new Date();
    await this.tenantRepo.save(tenant);

    // Invalidate all Redis caches for this tenant
    await this.featuresService.invalidateTenantFeatureCache(id);

    this.logger.log(`Archived tenant ${id}`);
  }

  // ─── Billing Event Handlers ───────────────────────────────────────────────

  /**
   * Handle billing-synced event: update stripe_customer_id
   */
  async handleBillingSynced(payload: { tenantId: string; stripeCustomerId: string }): Promise<void> {
    try {
      await this.tenantRepo.update(payload.tenantId, {
        stripeCustomerId: payload.stripeCustomerId,
      });
      this.logger.log(
        `Updated stripeCustomerId for tenant ${payload.tenantId}: ${payload.stripeCustomerId}`,
      );
    } catch (err) {
      this.logger.error(`Failed to handle billing-synced for tenant ${payload.tenantId}`, err);
    }
  }

  /**
   * Handle subscription-status event: update tenant status based on payment
   */
  async handleSubscriptionStatus(payload: {
    tenantId: string;
    status: 'active' | 'past_due' | 'cancelled' | 'suspended';
    plan?: string;
  }): Promise<void> {
    try {
      const tenant = await this.tenantRepo.findOne({ where: { id: payload.tenantId } });
      if (!tenant) {
        this.logger.warn(`Received subscription-status for unknown tenant ${payload.tenantId}`);
        return;
      }

      if (payload.status === 'active') {
        tenant.status = 'active';
        tenant.suspendedAt = null;
      } else if (payload.status === 'suspended' || payload.status === 'past_due') {
        tenant.status = 'suspended';
        tenant.suspendedAt = new Date();
      } else if (payload.status === 'cancelled') {
        tenant.status = 'cancelled';
        tenant.cancelledAt = new Date();
      }

      if (payload.plan && payload.plan !== tenant.currentPlan) {
        tenant.currentPlan = payload.plan;
      }

      await this.tenantRepo.save(tenant);
      this.logger.log(
        `Updated tenant ${payload.tenantId} status to '${payload.status}' via subscription event`,
      );
    } catch (err) {
      this.logger.error(
        `Failed to handle subscription-status for tenant ${payload.tenantId}`,
        err,
      );
    }
  }
}
