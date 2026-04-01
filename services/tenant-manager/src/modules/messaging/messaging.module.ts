import { Global, Logger, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ClientsModule, Transport } from '@nestjs/microservices';
import Redis from 'ioredis';

/**
 * Global module that provides REDIS_CLIENT and RABBITMQ_CLIENT tokens.
 * Marking it @Global() means all modules can inject these without needing to import MessagingModule.
 */
@Global()
@Module({
  imports: [
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
            queue: 'tenant_manager_publisher_queue',
            queueOptions: { durable: true },
            noAck: false,
          },
        }),
      },
    ]),
  ],
  providers: [
    {
      provide: 'REDIS_CLIENT',
      inject: [ConfigService],
      useFactory: (configService: ConfigService): Redis => {
        const redisUrl =
          configService.get<string>('app.redis.url') ?? 'redis://localhost:6379';
        const client = new Redis(redisUrl, {
          lazyConnect: true,
          maxRetriesPerRequest: 3,
          enableReadyCheck: true,
        });

        client.on('error', (err: Error) => {
          new Logger('Redis').error(`Redis connection error: ${err.message}`);
        });

        client.on('connect', () => {
          new Logger('Redis').log('Redis connected');
        });

        return client;
      },
    },
  ],
  exports: ['REDIS_CLIENT', 'RABBITMQ_CLIENT', ClientsModule],
})
export class MessagingModule {}
