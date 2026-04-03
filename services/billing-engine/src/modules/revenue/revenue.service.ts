import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Invoice } from '../invoices/entities/invoice.entity';
import { Subscription } from '../subscriptions/entities/subscription.entity';

export interface RevenueSummary {
  totalRevenue: number;
  activeSubscriptions: number;
  mrr: number;
  churnRate: number;
  arrByPlan: Array<{ plan: string; arr: number }>;
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
    const [totalRevenue, activeSubscriptions, revenueByPeriod, subscriptionsByPlan, churnRate, arrByPlan] =
      await Promise.all([
        this.getTotalRevenue(),
        this.getActiveSubscriptionCount(),
        this.getRevenueByPeriod(period),
        this.getSubscriptionsByPlan(),
        this.getChurnRate(),
        this.getArrByPlan(),
      ]);

    // MRR: sum of active subscription amounts in the current calendar month
    const mrr = await this.getCurrentMonthRevenue();

    return {
      totalRevenue,
      activeSubscriptions,
      mrr,
      churnRate,
      arrByPlan,
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

  /**
   * Churn rate = canceled subscriptions this month / total subscriptions at the
   * start of the month (active + canceled that started before the month began).
   */
  private async getChurnRate(): Promise<number> {
    const monthStart = `DATE_TRUNC('month', NOW())`;

    const [{ churned }] = await this.subscriptionRepo
      .createQueryBuilder('sub')
      .select('COUNT(*)', 'churned')
      .where('sub.status = :status', { status: 'canceled' })
      .andWhere(`sub.updated_at >= ${monthStart}`)
      .getRawMany<{ churned: string }>();

    const [{ total }] = await this.subscriptionRepo
      .createQueryBuilder('sub')
      .select('COUNT(*)', 'total')
      .where(`sub.created_at < ${monthStart}`)
      .getRawMany<{ total: string }>();

    const churnedCount = parseInt(churned ?? '0', 10);
    const totalAtStart = parseInt(total ?? '0', 10);

    if (totalAtStart === 0) return 0;
    return churnedCount / totalAtStart;
  }

  /**
   * ARR by plan = monthly amount × 12, grouped by plan_code.
   * Monthly amount is derived from paid invoices in the current calendar month.
   */
  private async getArrByPlan(): Promise<Array<{ plan: string; arr: number }>> {
    const rows = await this.invoiceRepo
      .createQueryBuilder('invoice')
      .innerJoin(
        'billing.subscriptions',
        'sub',
        'sub.stripe_customer_id = invoice.stripe_customer_id',
      )
      .select('sub.plan_code', 'plan')
      .addSelect('SUM(invoice.amount_paid) * 12', 'arr')
      .where('invoice.status = :status', { status: 'paid' })
      .andWhere(`DATE_TRUNC('month', invoice.paid_at) = DATE_TRUNC('month', NOW())`)
      .groupBy('sub.plan_code')
      .getRawMany<{ plan: string; arr: string }>();

    return rows.map((r) => ({ plan: r.plan, arr: parseFloat(r.arr ?? '0') }));
  }
}
