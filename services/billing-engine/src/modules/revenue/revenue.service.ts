import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Invoice } from '../invoices/entities/invoice.entity';
import { Subscription } from '../subscriptions/entities/subscription.entity';

export interface RevenueSummary {
  totalRevenue: number;
  activeSubscriptions: number;
  mrr: number;
  revenueByPeriod: Array<{ period: string; revenue: number }>;
  subscriptionsByPlan: Array<{ plan: string; count: number }>;
}

@Injectable()
export class RevenueService {
  constructor(
    @InjectRepository(Invoice)
    private readonly invoiceRepo: Repository<Invoice>,
    @InjectRepository(Subscription)
    private readonly subscriptionRepo: Repository<Subscription>,
  ) {}

  async getRevenueSummary(period: 'daily' | 'monthly' | 'yearly'): Promise<RevenueSummary> {
    const [totalRevenue, activeSubscriptions, revenueByPeriod, subscriptionsByPlan] =
      await Promise.all([
        this.getTotalRevenue(),
        this.getActiveSubscriptionCount(),
        this.getRevenueByPeriod(period),
        this.getSubscriptionsByPlan(),
      ]);

    // MRR: sum of active subscription amounts in the current calendar month
    const mrr = await this.getCurrentMonthRevenue();

    return {
      totalRevenue,
      activeSubscriptions,
      mrr,
      revenueByPeriod,
      subscriptionsByPlan,
    };
  }

  private async getTotalRevenue(): Promise<number> {
    const result = await this.invoiceRepo
      .createQueryBuilder('invoice')
      .select('SUM(invoice.amount_paid)', 'total')
      .where('invoice.status = :status', { status: 'paid' })
      .getRawOne<{ total: string | null }>();
    return parseFloat(result?.total ?? '0');
  }

  private async getActiveSubscriptionCount(): Promise<number> {
    return this.subscriptionRepo.count({ where: { status: 'active' } });
  }

  private async getCurrentMonthRevenue(): Promise<number> {
    const result = await this.invoiceRepo
      .createQueryBuilder('invoice')
      .select('SUM(invoice.amount_paid)', 'total')
      .where('invoice.status = :status', { status: 'paid' })
      .andWhere(`DATE_TRUNC('month', invoice.paid_at) = DATE_TRUNC('month', NOW())`)
      .getRawOne<{ total: string | null }>();
    return parseFloat(result?.total ?? '0');
  }

  private async getRevenueByPeriod(
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

  private async getSubscriptionsByPlan(): Promise<Array<{ plan: string; count: number }>> {
    const rows = await this.subscriptionRepo
      .createQueryBuilder('sub')
      .select('sub.plan_code', 'plan')
      .addSelect('COUNT(*)', 'count')
      .where('sub.status = :status', { status: 'active' })
      .groupBy('sub.plan_code')
      .getRawMany<{ plan: string; count: string }>();

    return rows.map((r) => ({ plan: r.plan, count: parseInt(r.count, 10) }));
  }
}
