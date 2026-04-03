import { Controller, Get, Inject, Optional } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import Redis from 'ioredis';
import { RabbitMqPublisherService } from '../common/messaging/rabbitmq-publisher.service';

interface HealthStatus {
  status: 'ok' | 'degraded' | 'error';
  service: string;
  timestamp: string;
  uptime: number;
  checks: {
    database: 'ok' | 'error';
    redis: 'ok' | 'error';
    rabbitmq: 'ok' | 'error';
  };
}

@Controller('health')
export class HealthController {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    @Optional() @Inject('REDIS_CLIENT')
    private readonly redis: Redis | null,
    private readonly rabbitMqPublisher: RabbitMqPublisherService,
  ) {}

  @Get()
  async check(): Promise<HealthStatus> {
    let dbStatus: 'ok' | 'error' = 'ok';
    let redisStatus: 'ok' | 'error' = 'ok';

    try {
      await this.dataSource.query('SELECT 1');
    } catch {
      dbStatus = 'error';
    }

    if (this.redis) {
      try {
        await this.redis.ping();
      } catch {
        redisStatus = 'error';
      }
    } else {
      redisStatus = 'error';
    }

    const rabbitmqStatus: 'ok' | 'error' = this.rabbitMqPublisher.isConnected() ? 'ok' : 'error';

    const overallStatus =
      dbStatus === 'ok' && redisStatus === 'ok' && rabbitmqStatus === 'ok' ? 'ok' : 'degraded';

    return {
      status: overallStatus,
      service: 'billing-engine',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      checks: {
        database: dbStatus,
        redis: redisStatus,
        rabbitmq: rabbitmqStatus,
      },
    };
  }
}
