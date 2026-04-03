import { Global, Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { RabbitMqPublisherService } from '../../common/messaging/rabbitmq-publisher.service';

/**
 * Global module that provides REDIS_CLIENT and RabbitMqPublisherService
 * to all modules without needing to import MessagingModule individually.
 */
@Global()
@Module({
  providers: [
    RabbitMqPublisherService,
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
  exports: ['REDIS_CLIENT', RabbitMqPublisherService],
})
export class MessagingModule {}
