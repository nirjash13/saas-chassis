import { DynamicModule, Module, MiddlewareConsumer } from '@nestjs/common';
import { ChassisOptions } from './config/chassis.config';
import { TenantContextMiddleware } from './middleware/tenant-context.middleware';
import { RequestIdMiddleware } from './middleware/request-id.middleware';

@Module({})
export class ChassisModule {
  static forRoot(options: ChassisOptions): DynamicModule {
    return {
      module: ChassisModule,
      global: true,
      providers: [
        { provide: 'CHASSIS_OPTIONS', useValue: options },
      ],
      exports: ['CHASSIS_OPTIONS'],
    };
  }

  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(RequestIdMiddleware, TenantContextMiddleware)
      .forRoutes('*');
  }
}
