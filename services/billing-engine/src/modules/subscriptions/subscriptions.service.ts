import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Subscription, SubscriptionStatus } from './entities/subscription.entity';

export interface CreateSubscriptionDto {
  tenantId: string;
  stripeCustomerId: string;
  planCode: string;
  status?: SubscriptionStatus;
  stripeSubscriptionId?: string;
}

export interface UpdateSubscriptionFromStripeDto {
  stripeSubscriptionId: string;
  planCode?: string;
  status?: SubscriptionStatus;
  currentPeriodStart?: Date;
  currentPeriodEnd?: Date;
  cancelAtPeriodEnd?: boolean;
}

@Injectable()
export class SubscriptionsService {
  private readonly logger = new Logger(SubscriptionsService.name);

  constructor(
    @InjectRepository(Subscription)
    private readonly subscriptionRepo: Repository<Subscription>,
  ) {}

  async findByTenantId(tenantId: string): Promise<Subscription> {
    const sub = await this.subscriptionRepo.findOne({ where: { tenantId } });
    if (!sub) {
      throw new NotFoundException(`No subscription found for tenant ${tenantId}`);
    }
    return sub;
  }

  async findByStripeCustomerId(stripeCustomerId: string): Promise<Subscription | null> {
    return this.subscriptionRepo.findOne({ where: { stripeCustomerId } });
  }

  async create(dto: CreateSubscriptionDto): Promise<Subscription> {
    const existing = await this.subscriptionRepo.findOne({ where: { tenantId: dto.tenantId } });
    if (existing) {
      throw new ConflictException(`Subscription already exists for tenant ${dto.tenantId}`);
    }

    const subscription = this.subscriptionRepo.create({
      tenantId: dto.tenantId,
      stripeCustomerId: dto.stripeCustomerId,
      planCode: dto.planCode,
      status: dto.status ?? 'trialing',
      stripeSubscriptionId: dto.stripeSubscriptionId ?? null,
    });

    const saved = await this.subscriptionRepo.save(subscription);
    this.logger.log(`Created subscription for tenant ${dto.tenantId} on plan ${dto.planCode}`);
    return saved;
  }

  async updateFromStripe(dto: UpdateSubscriptionFromStripeDto): Promise<void> {
    const sub = await this.subscriptionRepo.findOne({
      where: { stripeSubscriptionId: dto.stripeSubscriptionId },
    });

    if (!sub) {
      this.logger.warn(`No subscription found for stripeSubscriptionId ${dto.stripeSubscriptionId}`);
      return;
    }

    if (dto.planCode !== undefined) sub.planCode = dto.planCode;
    if (dto.status !== undefined) sub.status = dto.status;
    if (dto.currentPeriodStart !== undefined) sub.currentPeriodStart = dto.currentPeriodStart;
    if (dto.currentPeriodEnd !== undefined) sub.currentPeriodEnd = dto.currentPeriodEnd;
    if (dto.cancelAtPeriodEnd !== undefined) sub.cancelAtPeriodEnd = dto.cancelAtPeriodEnd;

    await this.subscriptionRepo.save(sub);
    this.logger.log(`Updated subscription ${dto.stripeSubscriptionId} status=${sub.status}`);
  }

  async linkStripeSubscription(
    stripeCustomerId: string,
    stripeSubscriptionId: string,
    status: SubscriptionStatus,
    currentPeriodStart: Date,
    currentPeriodEnd: Date,
  ): Promise<void> {
    const sub = await this.subscriptionRepo.findOne({ where: { stripeCustomerId } });
    if (!sub) {
      this.logger.warn(`No subscription found for stripeCustomerId ${stripeCustomerId}`);
      return;
    }
    sub.stripeSubscriptionId = stripeSubscriptionId;
    sub.status = status;
    sub.currentPeriodStart = currentPeriodStart;
    sub.currentPeriodEnd = currentPeriodEnd;
    await this.subscriptionRepo.save(sub);
  }

  async updateStatusByTenantId(tenantId: string, status: SubscriptionStatus): Promise<void> {
    await this.subscriptionRepo.update({ tenantId }, { status });
    this.logger.log(`Updated subscription status for tenant ${tenantId} → ${status}`);
  }
}
