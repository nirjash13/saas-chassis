import { Module, OnApplicationBootstrap, Logger } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import appConfig from './config/app.config';

// Entities
import { Subscription } from './modules/subscriptions/entities/subscription.entity';
import { Invoice } from './modules/invoices/entities/invoice.entity';
import { WebhookEvent } from './modules/stripe/entities/webhook-event.entity';

// Modules
import { MessagingModule } from './modules/messaging/messaging.module';
import { AuthModule } from './modules/auth/auth.module';
import { SubscriptionsModule } from './modules/subscriptions/subscriptions.module';
import { InvoicesModule } from './modules/invoices/invoices.module';
import { StripeModule } from './modules/stripe/stripe.module';
import { RevenueModule } from './modules/revenue/revenue.module';

// Controllers
import { HealthController } from './health/health.controller';

@Module({
  imports: [
    // ── Configuration ────────────────────────────────────────────────────────
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig],
    }),

    // ── Database ──────────────────────────────────────────────────────────────
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres' as const,
        url: process.env.DATABASE_URL,
        schema: 'billing',
        synchronize: false,
        logging: configService.get<string>('app.nodeEnv') === 'development',
        autoLoadEntities: true,
        ssl:
          configService.get<string>('app.nodeEnv') === 'production'
            ? { rejectUnauthorized: false }
            : false,
        entities: [Subscription, Invoice, WebhookEvent],
      }),
    }),

    // ── Infrastructure ────────────────────────────────────────────────────────
    MessagingModule,

    // ── Auth ──────────────────────────────────────────────────────────────────
    AuthModule,

    // ── Feature Modules ───────────────────────────────────────────────────────
    SubscriptionsModule,
    InvoicesModule,
    StripeModule,
    RevenueModule,
  ],

  controllers: [HealthController],

  providers: [],
})
export class AppModule implements OnApplicationBootstrap {
  private readonly logger = new Logger(AppModule.name);

  async onApplicationBootstrap(): Promise<void> {
    this.logger.log('Billing Engine Service bootstrap complete');
  }
}
