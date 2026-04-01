import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'plans', schema: 'tenant_mgmt' })
export class Plan {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 50, unique: true })
  code!: string;

  @Column({ type: 'varchar', length: 100 })
  name!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({ name: 'price_monthly', type: 'decimal', precision: 10, scale: 2, nullable: true })
  priceMonthly!: number | null;

  @Column({ name: 'price_yearly', type: 'decimal', precision: 10, scale: 2, nullable: true })
  priceYearly!: number | null;

  @Column({ name: 'stripe_price_id_monthly', type: 'varchar', length: 100, nullable: true })
  stripePriceIdMonthly!: string | null;

  @Column({ name: 'stripe_price_id_yearly', type: 'varchar', length: 100, nullable: true })
  stripePriceIdYearly!: string | null;

  @Column({ name: 'max_users', type: 'integer', nullable: true })
  maxUsers!: number | null;

  @Column({ name: 'max_units', type: 'integer', nullable: true })
  maxUnits!: number | null;

  // Array of feature codes that are auto-enabled for this plan
  @Column({ name: 'included_features', type: 'jsonb', default: '[]' })
  includedFeatures!: string[];

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @Column({ name: 'sort_order', type: 'integer', default: 0 })
  sortOrder!: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
