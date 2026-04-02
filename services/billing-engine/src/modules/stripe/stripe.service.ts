import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';

@Injectable()
export class StripeService {
  private readonly logger = new Logger(StripeService.name);
  readonly client: Stripe;

  constructor(private readonly configService: ConfigService) {
    const secretKey = configService.get<string>('app.stripe.secretKey') ?? '';
    this.client = new Stripe(secretKey, { apiVersion: '2023-10-16' });
  }

  async createCustomer(params: {
    email: string;
    name: string;
    tenantId: string;
  }): Promise<Stripe.Customer> {
    return this.client.customers.create({
      email: params.email,
      name: params.name,
      metadata: { tenantId: params.tenantId },
    });
  }

  async createCheckoutSession(
    stripeCustomerId: string,
    tenantId: string,
  ): Promise<string> {
    const successUrl = this.configService.get<string>('app.stripe.successUrl')!;
    const cancelUrl = this.configService.get<string>('app.stripe.cancelUrl')!;

    const session = await this.client.checkout.sessions.create({
      customer: stripeCustomerId,
      mode: 'subscription',
      payment_method_types: ['card'],
      metadata: { tenantId },
      success_url: `${successUrl}?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: cancelUrl,
      // Price IDs should be passed in from a real integration;
      // left as a placeholder for the chassis scaffold
      line_items: [],
    });

    this.logger.log(`Created checkout session ${session.id} for customer ${stripeCustomerId}`);
    return session.url ?? '';
  }

  async createCustomerPortalSession(stripeCustomerId: string): Promise<string> {
    const returnUrl = this.configService.get<string>('app.stripe.portalReturnUrl')!;

    const session = await this.client.billingPortal.sessions.create({
      customer: stripeCustomerId,
      return_url: returnUrl,
    });

    this.logger.log(`Created portal session for customer ${stripeCustomerId}`);
    return session.url;
  }

  constructWebhookEvent(rawBody: Buffer, signature: string, secret: string): Stripe.Event {
    return this.client.webhooks.constructEvent(rawBody, signature, secret);
  }
}
