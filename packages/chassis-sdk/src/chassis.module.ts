import { DynamicModule, Module, MiddlewareConsumer } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ChassisOptions } from './config/chassis.config';
import { TenantContextMiddleware } from './middleware/tenant-context.middleware';
import { RequestIdMiddleware } from './middleware/request-id.middleware';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { FeatureFlagService } from './services/feature-flag.service';
import { AuditPublisherService } from './services/audit-publisher.service';
import { InternalHttpService } from './services/internal-http.service';

@Module({})
export class ChassisModule {
  static forRoot(options: ChassisOptions): DynamicModule {
    return {
      module: ChassisModule,
      global: true,
      providers: [
        { provide: 'CHASSIS_OPTIONS', useValue: options },
        FeatureFlagService,
        AuditPublisherService,
        InternalHttpService,
        { provide: APP_GUARD, useClass: JwtAuthGuard },
      ],
      exports: [
        'CHASSIS_OPTIONS',
        FeatureFlagService,
        AuditPublisherService,
        InternalHttpService,
      ],
    };
  }

  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(RequestIdMiddleware, TenantContextMiddleware)
      .forRoutes('*');
  }
}
