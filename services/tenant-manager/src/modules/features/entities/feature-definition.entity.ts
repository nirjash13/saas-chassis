import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { TenantFeature } from './tenant-feature.entity';

export type FeatureCategory = 'core' | 'addon' | 'premium';

@Entity({ name: 'feature_definitions', schema: 'tenant_mgmt' })
export class FeatureDefinition {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 100, unique: true })
  code!: string;

  @Column({ type: 'varchar', length: 200 })
  name!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({ type: 'varchar', length: 50 })
  category!: FeatureCategory;

  @Column({ name: 'default_enabled', type: 'boolean', default: false })
  defaultEnabled!: boolean;

  @Column({ name: 'requires_plan', type: 'varchar', length: 50, nullable: true })
  requiresPlan!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @OneToMany(() => TenantFeature, (tf) => tf.featureDefinition)
  tenantFeatures!: TenantFeature[];
}
