import { Tenant, TenantStatus } from '../entities/tenant.entity';

export class TenantResponseDto {
  id!: string;
  name!: string;
  slug!: string;
  status!: TenantStatus;
  currentPlan!: string;
  adminEmail!: string;
  phone!: string | null;
  address!: string | null;
  stripeCustomerId!: string | null;
  enabledFeatures!: string[];
  metadata!: Record<string, unknown>;
  trialEndsAt!: Date | null;
  suspendedAt!: Date | null;
  cancelledAt!: Date | null;
  createdAt!: Date;
  updatedAt!: Date;

  static fromEntity(tenant: Tenant): TenantResponseDto {
    const dto = new TenantResponseDto();
    dto.id = tenant.id;
    dto.name = tenant.name;
    dto.slug = tenant.slug;
    dto.status = tenant.status;
    dto.currentPlan = tenant.currentPlan;
    dto.adminEmail = tenant.adminEmail;
    dto.phone = tenant.phone;
    dto.address = tenant.address;
    dto.stripeCustomerId = tenant.stripeCustomerId;
    dto.enabledFeatures = tenant.enabledFeatures ?? [];
    dto.metadata = tenant.metadata ?? {};
    dto.trialEndsAt = tenant.trialEndsAt;
    dto.suspendedAt = tenant.suspendedAt;
    dto.cancelledAt = tenant.cancelledAt;
    dto.createdAt = tenant.createdAt;
    dto.updatedAt = tenant.updatedAt;
    return dto;
  }
}
