import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ClientsModule, Transport } from '@nestjs/microservices';
import appConfig from './config/app.config';
import databaseConfig from './config/database.config';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { MembershipsModule } from './modules/memberships/memberships.module';
import { RolesModule } from './modules/roles/roles.module';
import { ImpersonationModule } from './modules/impersonation/impersonation.module';
import { HealthController } from './health/health.controller';

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

    // RabbitMQ client (optional - service degrades gracefully without it)
    ClientsModule.registerAsync([
      {
        name: 'RABBITMQ_CLIENT',
        imports: [ConfigModule],
        inject: [ConfigService],
        useFactory: (configService: ConfigService) => ({
          transport: Transport.RMQ,
          options: {
            urls: [
              configService.get<string>('app.rabbitmq.url') ??
                'amqp://guest:guest@localhost:5672',
            ],
            queue: 'identity_service_queue',
            queueOptions: { durable: true },
            exchanges: [
              { name: 'chassis.audit', type: 'fanout' },
              { name: 'chassis.tenants', type: 'direct' },
            ],
          },
        }),
      },
    ]),

    // Feature modules
    AuthModule,
    UsersModule,
    MembershipsModule,
    RolesModule,
    ImpersonationModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
