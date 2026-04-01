import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { TenantFeature } from '../../features/entities/tenant-feature.entity';

export type TenantStatus = 'provisioning' | 'active' | 'suspended' | 'cancelled';

@Entity({ name: 'tenants', schema: 'tenant_mgmt' })
export class Tenant {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 200 })
  name!: string;

  @Column({ type: 'varchar', length: 100, unique: true })
  slug!: string;

  @Column({
    type: 'varchar',
    length: 50,
    default: 'provisioning',
  })
  status!: TenantStatus;

  // Billing linkage
  @Column({ name: 'stripe_customer_id', type: 'varchar', length: 100, nullable: true })
  stripeCustomerId!: string | null;

  @Column({ name: 'current_plan', type: 'varchar', length: 50, default: 'free' })
  currentPlan!: string;

  // Metadata (flexible product-specific config)
  @Column({ type: 'jsonb', default: '{}' })
  metadata!: Record<string, unknown>;

  // Feature flags (what modules are enabled — denormalized snapshot for quick reads)
  @Column({ name: 'enabled_features', type: 'jsonb', default: '[]' })
  enabledFeatures!: string[];

  // Contact info
  @Column({ name: 'admin_email', type: 'varchar', length: 320 })
  adminEmail!: string;

  @Column({ type: 'varchar', length: 20, nullable: true })
  phone!: string | null;

  @Column({ type: 'text', nullable: true })
  address!: string | null;

  // Lifecycle timestamps
  @Column({ name: 'trial_ends_at', type: 'timestamptz', nullable: true })
  trialEndsAt!: Date | null;

  @Column({ name: 'suspended_at', type: 'timestamptz', nullable: true })
  suspendedAt!: Date | null;

  @Column({ name: 'cancelled_at', type: 'timestamptz', nullable: true })
  cancelledAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @OneToMany(() => TenantFeature, (tf) => tf.tenant)
  tenantFeatures!: TenantFeature[];
}
