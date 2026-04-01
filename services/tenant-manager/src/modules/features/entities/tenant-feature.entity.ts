import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { Tenant } from '../../tenants/entities/tenant.entity';
import { FeatureDefinition } from './feature-definition.entity';

@Entity({ name: 'tenant_features', schema: 'tenant_mgmt' })
@Unique('uq_tenant_feature', ['tenantId', 'featureCode'])
@Index('idx_tenant_features_tenant_id', ['tenantId'])
export class TenantFeature {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  @Column({ name: 'feature_code', type: 'varchar', length: 100 })
  featureCode!: string;

  @Column({ name: 'is_enabled', type: 'boolean' })
  isEnabled!: boolean;

  @Column({ name: 'enabled_by', type: 'uuid', nullable: true })
  enabledBy!: string | null;

  @CreateDateColumn({ name: 'enabled_at', type: 'timestamptz' })
  enabledAt!: Date;

  @ManyToOne(() => Tenant, (tenant) => tenant.tenantFeatures, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenant_id' })
  tenant!: Tenant;

  @ManyToOne(() => FeatureDefinition, (fd) => fd.tenantFeatures)
  @JoinColumn({ name: 'feature_code', referencedColumnName: 'code' })
  featureDefinition!: FeatureDefinition;
}
