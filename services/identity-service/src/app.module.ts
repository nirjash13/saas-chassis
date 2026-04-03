import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import appConfig from './config/app.config';
import databaseConfig from './config/database.config';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { MembershipsModule } from './modules/memberships/memberships.module';
import { RolesModule } from './modules/roles/roles.module';
import { ImpersonationModule } from './modules/impersonation/impersonation.module';
import { HealthController } from './health/health.controller';
import { MessagingModule } from './common/messaging/messaging.module';
import { RlsSubscriber } from './common/database/rls.subscriber';
import { TenantContextMiddleware } from './common/middleware/tenant-context.middleware';
import { AuditInterceptor } from './common/interceptors/audit.interceptor';

@Module({
  imports: [
    // Configuration
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig, databaseConfig],
      envFilePath: ['.env.local', '.env'],
    }),

    // Database
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        url: configService.get<string>('DATABASE_URL'),
        schema: 'iam',
        synchronize: false,
        logging: configService.get<string>('NODE_ENV') === 'development',
        autoLoadEntities: true,
        ssl:
          configService.get<string>('NODE_ENV') === 'production'
            ? { rejectUnauthorized: false }
            : false,
      }),
    }),

    // Messaging (global — provides RabbitMqPublisherService to all modules)
    MessagingModule,

    // Feature modules
    AuthModule,
    UsersModule,
    MembershipsModule,
    RolesModule,
    ImpersonationModule,
  ],
  controllers: [HealthController],
  providers: [
    RlsSubscriber,
    {
      provide: APP_INTERCEPTOR,
      useClass: AuditInterceptor,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(TenantContextMiddleware).forRoutes('*');
  }
}
