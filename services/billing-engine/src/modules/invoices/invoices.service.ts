import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Invoice, InvoiceStatus } from './entities/invoice.entity';

export interface CreateInvoiceDto {
  tenantId: string;
  stripeInvoiceId: string;
  stripeCustomerId: string;
  amountDue: number;
  amountPaid: number;
  currency: string;
  status: InvoiceStatus;
  invoiceUrl?: string | null;
  invoicePdf?: string | null;
  periodStart?: Date | null;
  periodEnd?: Date | null;
  paidAt?: Date | null;
}

@Injectable()
export class InvoicesService {
  private readonly logger = new Logger(InvoicesService.name);

  constructor(
    @InjectRepository(Invoice)
    private readonly invoiceRepo: Repository<Invoice>,
  ) {}

  async findByTenantId(tenantId: string, page = 1, limit = 20): Promise<{
    items: Invoice[];
    total: number;
    page: number;
    limit: number;
  }> {
    const [items, total] = await this.invoiceRepo.findAndCount({
      where: { tenantId },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { items, total, page, limit };
  }

  async upsertFromStripe(dto: CreateInvoiceDto): Promise<Invoice> {
    const existing = await this.invoiceRepo.findOne({
      where: { stripeInvoiceId: dto.stripeInvoiceId },
    });

    if (existing) {
      existing.status = dto.status;
      existing.amountPaid = dto.amountPaid;
      existing.paidAt = dto.paidAt ?? existing.paidAt;
      return this.invoiceRepo.save(existing);
    }

    const invoice = this.invoiceRepo.create({
      tenantId: dto.tenantId,
      stripeInvoiceId: dto.stripeInvoiceId,
      stripeCustomerId: dto.stripeCustomerId,
      amountDue: dto.amountDue,
      amountPaid: dto.amountPaid,
      currency: dto.currency,
      status: dto.status,
      invoiceUrl: dto.invoiceUrl ?? null,
      invoicePdf: dto.invoicePdf ?? null,
      periodStart: dto.periodStart ?? null,
      periodEnd: dto.periodEnd ?? null,
      paidAt: dto.paidAt ?? null,
    });

    const saved = await this.invoiceRepo.save(invoice);
    this.logger.log(`Recorded invoice ${dto.stripeInvoiceId} for tenant ${dto.tenantId}`);
    return saved;
  }

  async getTotalRevenue(): Promise<number> {
    const result = await this.invoiceRepo
      .createQueryBuilder('invoice')
      .select('SUM(invoice.amount_paid)', 'total')
      .where('invoice.status = :status', { status: 'paid' })
      .getRawOne<{ total: string | null }>();
    return parseFloat(result?.total ?? '0');
  }

  async getRevenueByPeriod(
    period: 'daily' | 'monthly' | 'yearly',
  ): Promise<Array<{ period: string; revenue: number }>> {
    const formatMap: Record<string, string> = {
      daily: 'YYYY-MM-DD',
      monthly: 'YYYY-MM',
      yearly: 'YYYY',
    };

    const fmt = formatMap[period];

    const rows = await this.invoiceRepo
      .createQueryBuilder('invoice')
      .select(`TO_CHAR(invoice.paid_at, '${fmt}')`, 'period')
      .addSelect('SUM(invoice.amount_paid)', 'revenue')
      .where('invoice.status = :status', { status: 'paid' })
      .andWhere('invoice.paid_at IS NOT NULL')
      .groupBy(`TO_CHAR(invoice.paid_at, '${fmt}')`)
      .orderBy(`TO_CHAR(invoice.paid_at, '${fmt}')`, 'DESC')
      .limit(30)
      .getRawMany<{ period: string; revenue: string }>();

    return rows.map((r) => ({ period: r.period, revenue: parseFloat(r.revenue) }));
  }
}
