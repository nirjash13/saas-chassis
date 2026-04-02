import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

export type InvoiceStatus = 'draft' | 'open' | 'paid' | 'void' | 'uncollectible';

@Entity({ name: 'invoices', schema: 'billing' })
export class Invoice {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  @Column({ name: 'stripe_invoice_id', type: 'varchar', length: 100, unique: true })
  stripeInvoiceId!: string;

  @Column({ name: 'stripe_customer_id', type: 'varchar', length: 100 })
  stripeCustomerId!: string;

  @Column({ name: 'amount_due', type: 'decimal', precision: 12, scale: 2 })
  amountDue!: number;

  @Column({ name: 'amount_paid', type: 'decimal', precision: 12, scale: 2, default: 0 })
  amountPaid!: number;

  @Column({ type: 'varchar', length: 3, default: 'usd' })
  currency!: string;

  @Column({ type: 'varchar', length: 30 })
  status!: InvoiceStatus;

  @Column({ name: 'invoice_url', type: 'text', nullable: true })
  invoiceUrl!: string | null;

  @Column({ name: 'invoice_pdf', type: 'text', nullable: true })
  invoicePdf!: string | null;

  @Column({ name: 'period_start', type: 'timestamptz', nullable: true })
  periodStart!: Date | null;

  @Column({ name: 'period_end', type: 'timestamptz', nullable: true })
  periodEnd!: Date | null;

  @Column({ name: 'paid_at', type: 'timestamptz', nullable: true })
  paidAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
