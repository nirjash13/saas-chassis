import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StripeService } from './stripe.service';
import { StripeWebhookController } from './stripe-webhook.controller';
import { WebhookEvent } from './entities/webhook-event.entity';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { InvoicesModule } from '../invoices/invoices.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([WebhookEvent]),
    SubscriptionsModule,
    InvoicesModule,
  ],
  controllers: [StripeWebhookController],
  providers: [StripeService],
  exports: [StripeService],
})
export class StripeModule {}
