import { Module, MiddlewareConsumer, NestModule, OnApplicationBootstrap, Logger } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import appConfig from './config/app.config';

// Entities
import { Tenant } from './modules/tenants/entities/tenant.entity';
import { FeatureDefinition } from './modules/features/entities/feature-definition.entity';
import { TenantFeature } from './modules/features/entities/tenant-feature.entity';
import { Plan } from './modules/plans/entities/plan.entity';

// Modules
import { MessagingModule } from './modules/messaging/messaging.module';
import { AuthModule } from './modules/auth/auth.module';
import { TenantsModule } from './modules/tenants/tenants.module';
import { FeaturesModule } from './modules/features/features.module';
import { PlansModule } from './modules/plans/plans.module';

// Controllers
import { HealthController } from './health/health.controller';

// RLS
import { RlsSubscriber } from './common/database/rls.subscriber';
import { TenantContextMiddleware } from './common/middleware/tenant-context.middleware';

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
        schema: 'tenant_mgmt',
        synchronize: false,
        logging: configService.get<string>('app.nodeEnv') === 'development',
        autoLoadEntities: true,
        ssl:
          configService.get<string>('app.nodeEnv') === 'production'
            ? { rejectUnauthorized: false }
            : false,
        entities: [Tenant, FeatureDefinition, TenantFeature, Plan],
      }),
    }),

    // ── Infrastructure ────────────────────────────────────────────────────────
    // MessagingModule is @Global() — provides REDIS_CLIENT and RabbitMqPublisherService
    // to all modules without needing to import it individually.
    MessagingModule,

    // ── Auth ──────────────────────────────────────────────────────────────────
    AuthModule,

    // ── Feature Modules (order matters: Plans and Features before Tenants) ───
    PlansModule,
    FeaturesModule,
    TenantsModule,
  ],

  controllers: [HealthController],

  providers: [RlsSubscriber],
})
export class AppModule implements NestModule, OnApplicationBootstrap {
  private readonly logger = new Logger(AppModule.name);

  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(TenantContextMiddleware).forRoutes('*');
  }

  async onApplicationBootstrap(): Promise<void> {
    this.logger.log('Tenant Manager Service bootstrap complete');
  }
}
