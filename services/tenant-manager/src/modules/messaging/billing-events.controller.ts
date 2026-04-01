import { Controller, Logger } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { TenantsService } from '../tenants/tenants.service';

interface BillingSyncedPayload {
  tenantId: string;
  stripeCustomerId: string;
}

interface SubscriptionStatusPayload {
  tenantId: string;
  status: 'active' | 'past_due' | 'cancelled' | 'suspended';
  plan?: string;
}

/**
 * Microservice message handler for RabbitMQ events consumed by the Tenant Manager.
 *
 * Consumed events:
 * - tenants.billing-synced  → Update stripe_customer_id on tenant
 * - tenants.subscription-status → Update tenant status based on payment
 */
@Controller()
export class BillingEventsController {
  private readonly logger = new Logger(BillingEventsController.name);

  constructor(private readonly tenantsService: TenantsService) {}

  @MessagePattern('billing-synced')
  async handleBillingSynced(@Payload() payload: BillingSyncedPayload): Promise<void> {
    this.logger.log(
      `Received billing-synced for tenant ${payload.tenantId}: customer ${payload.stripeCustomerId}`,
    );
    await this.tenantsService.handleBillingSynced(payload);
  }

  @MessagePattern('subscription-status')
  async handleSubscriptionStatus(@Payload() payload: SubscriptionStatusPayload): Promise<void> {
    this.logger.log(
      `Received subscription-status for tenant ${payload.tenantId}: status=${payload.status}`,
    );
    await this.tenantsService.handleSubscriptionStatus(payload);
  }
}
