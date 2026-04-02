import {
  Controller,
  Logger,
  Post,
  RawBodyRequest,
  Req,
  Res,
  Inject,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { ClientProxy, MessagePattern, Payload } from '@nestjs/microservices';
import { Repository } from 'typeorm';
import { Request, Response } from 'express';
import Stripe from 'stripe';
import { StripeService } from './stripe.service';
import { WebhookEvent } from './entities/webhook-event.entity';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { InvoicesService } from '../invoices/invoices.service';

interface TenantProvisionedEvent {
  tenantId: string;
  slug: string;
  plan: string;
  adminEmail: string;
}

@Controller()
export class StripeWebhookController {
  private readonly logger = new Logger(StripeWebhookController.name);

  constructor(
    private readonly stripeService: StripeService,
    private readonly configService: ConfigService,
    private readonly subscriptionsService: SubscriptionsService,
    private readonly invoicesService: InvoicesService,
    @InjectRepository(WebhookEvent)
    private readonly webhookRepo: Repository<WebhookEvent>,
    @Optional() @Inject('RABBITMQ_CLIENT') private readonly rabbitClient: ClientProxy | null,
  ) {}

  // ── HTTP: Stripe webhook endpoint ────────────────────────────────────────────

  @Post('/webhooks/stripe')
  async handleWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Res() res: Response,
  ): Promise<void> {
    const sig = req.headers['stripe-signature'] as string;
    const secret = this.configService.get<string>('app.stripe.webhookSecret') ?? '';

    let event: Stripe.Event;
    try {
      event = this.stripeService.constructWebhookEvent(
        req.rawBody as Buffer,
        sig,
        secret,
      );
    } catch (err) {
      this.logger.warn(`Webhook signature verification failed: ${(err as Error).message}`);
      res.status(400).send('Webhook signature verification failed');
      return;
    }

    // Idempotency: skip already-processed events
    const existing = await this.webhookRepo.findOne({
      where: { stripeEventId: event.id },
    });
    if (existing?.processed) {
      res.status(200).json({ received: true, duplicate: true });
      return;
    }

    // Store event for audit trail
    await this.webhookRepo.upsert(
      {
        stripeEventId: event.id,
        eventType: event.type,
        payload: event.data as unknown as Record<string, unknown>,
        processed: false,
      },
      ['stripeEventId'],
    );

    try {
      await this.processEvent(event);
      await this.webhookRepo.update(
        { stripeEventId: event.id },
        { processed: true, processedAt: new Date() },
      );
    } catch (err) {
      this.logger.error(`Failed to process webhook ${event.id} (${event.type})`, err);
      await this.webhookRepo.update(
        { stripeEventId: event.id },
        { errorMessage: (err as Error).message },
      );
    }

    res.status(200).json({ received: true });
  }

  // ── RabbitMQ: tenant.provisioned consumer ───────────────────────────────────

  @MessagePattern('tenant.provisioned')
  async onTenantProvisioned(@Payload() msg: TenantProvisionedEvent): Promise<void> {
    this.logger.log(`Received tenant.provisioned for tenant ${msg.tenantId}`);

    try {
      // 1. Create Stripe customer
      const customer = await this.stripeService.createCustomer({
        email: msg.adminEmail,
        name: msg.slug,
        tenantId: msg.tenantId,
      });

      // 2. Create local subscription record
      await this.subscriptionsService.create({
        tenantId: msg.tenantId,
        stripeCustomerId: customer.id,
        planCode: msg.plan,
        status: msg.plan === 'free' ? 'active' : 'trialing',
      });

      // 3. Notify tenant manager
      if (this.rabbitClient) {
        this.rabbitClient
          .emit('billing-synced', { tenantId: msg.tenantId, stripeCustomerId: customer.id })
          .subscribe({
            error: (err: Error) =>
              this.logger.warn(`Failed to publish billing-synced: ${err.message}`),
          });
      }

      this.logger.log(`Provisioned Stripe customer ${customer.id} for tenant ${msg.tenantId}`);
    } catch (err) {
      this.logger.error(`Failed to handle tenant.provisioned for ${msg.tenantId}`, err);
    }
  }

  // ── Internal: event router ───────────────────────────────────────────────────

  private async processEvent(event: Stripe.Event): Promise<void> {
    switch (event.type) {
      case 'customer.subscription.created':
        await this.handleSubscriptionCreated(event.data.object as Stripe.Subscription);
        break;

      case 'customer.subscription.updated':
        await this.handleSubscriptionUpdated(event.data.object as Stripe.Subscription);
        break;

      case 'customer.subscription.deleted':
        await this.handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
        break;

      case 'invoice.paid':
        await this.handleInvoicePaid(event.data.object as Stripe.Invoice);
        break;

      case 'invoice.payment_failed':
        await this.handleInvoicePaymentFailed(event.data.object as Stripe.Invoice);
        break;

      case 'customer.created':
        this.logger.debug(`Customer created: ${(event.data.object as Stripe.Customer).id}`);
        break;

      default:
        this.logger.debug(`Unhandled webhook event type: ${event.type}`);
    }
  }

  private async handleSubscriptionCreated(sub: Stripe.Subscription): Promise<void> {
    const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id;
    await this.subscriptionsService.linkStripeSubscription(
      customerId,
      sub.id,
      sub.status as 'active' | 'trialing',
      new Date(sub.current_period_start * 1000),
      new Date(sub.current_period_end * 1000),
    );
    await this.publishSubscriptionStatus(customerId, sub.status, null);
  }

  private async handleSubscriptionUpdated(sub: Stripe.Subscription): Promise<void> {
    const planCode =
      sub.items.data[0]?.price?.lookup_key ??
      sub.items.data[0]?.price?.id ??
      undefined;

    await this.subscriptionsService.updateFromStripe({
      stripeSubscriptionId: sub.id,
      planCode,
      status: sub.status as 'active' | 'trialing' | 'past_due' | 'canceled' | 'unpaid' | 'incomplete',
      currentPeriodStart: new Date(sub.current_period_start * 1000),
      currentPeriodEnd: new Date(sub.current_period_end * 1000),
      cancelAtPeriodEnd: sub.cancel_at_period_end,
    });

    const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id;
    await this.publishSubscriptionStatus(customerId, sub.status, planCode ?? null);
  }

  private async handleSubscriptionDeleted(sub: Stripe.Subscription): Promise<void> {
    await this.subscriptionsService.updateFromStripe({
      stripeSubscriptionId: sub.id,
      status: 'canceled',
    });
    const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id;
    await this.publishSubscriptionStatus(customerId, 'canceled', null);
  }

  private async handleInvoicePaid(inv: Stripe.Invoice): Promise<void> {
    const customerId = typeof inv.customer === 'string' ? inv.customer : inv.customer?.id ?? '';
    const localSub = await this.subscriptionsService.findByStripeCustomerId(customerId);

    if (localSub) {
      await this.invoicesService.upsertFromStripe({
        tenantId: localSub.tenantId,
        stripeInvoiceId: inv.id,
        stripeCustomerId: customerId,
        amountDue: inv.amount_due / 100,
        amountPaid: inv.amount_paid / 100,
        currency: inv.currency,
        status: 'paid',
        invoiceUrl: inv.hosted_invoice_url ?? null,
        invoicePdf: inv.invoice_pdf ?? null,
        periodStart: inv.period_start ? new Date(inv.period_start * 1000) : null,
        periodEnd: inv.period_end ? new Date(inv.period_end * 1000) : null,
        paidAt: new Date(),
      });

      // Recover from past_due on payment success
      if (localSub.status === 'past_due') {
        await this.subscriptionsService.updateStatusByTenantId(localSub.tenantId, 'active');
        await this.publishSubscriptionStatus(customerId, 'active', null);
      }
    }
  }

  private async handleInvoicePaymentFailed(inv: Stripe.Invoice): Promise<void> {
    const customerId = typeof inv.customer === 'string' ? inv.customer : inv.customer?.id ?? '';
    const localSub = await this.subscriptionsService.findByStripeCustomerId(customerId);

    if (localSub) {
      await this.subscriptionsService.updateStatusByTenantId(localSub.tenantId, 'past_due');
      await this.publishSubscriptionStatus(customerId, 'past_due', null);
    }
  }

  private async publishSubscriptionStatus(
    stripeCustomerId: string,
    status: string,
    plan: string | null,
  ): Promise<void> {
    if (!this.rabbitClient) return;

    const localSub = await this.subscriptionsService.findByStripeCustomerId(stripeCustomerId);
    if (!localSub) return;

    const payload: { tenantId: string; status: string; plan?: string } = {
      tenantId: localSub.tenantId,
      status,
    };
    if (plan) payload.plan = plan;

    this.rabbitClient
      .emit('subscription-status', payload)
      .subscribe({
        error: (err: Error) =>
          this.logger.warn(`Failed to publish subscription-status: ${err.message}`),
      });
  }
}
