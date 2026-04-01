import { Controller, Get, Inject, Optional } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import Redis from 'ioredis';

interface HealthStatus {
  status: 'ok' | 'degraded' | 'error';
  service: string;
  timestamp: string;
  uptime: number;
  checks: {
    database: 'ok' | 'error';
    redis: 'ok' | 'error';
  };
}

@Controller('health')
export class HealthController {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    @Optional() @Inject('REDIS_CLIENT')
    private readonly redis: Redis | null,
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

    const overallStatus =
      dbStatus === 'ok' && redisStatus === 'ok' ? 'ok' : 'degraded';

    return {
      status: overallStatus,
      service: 'tenant-manager',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      checks: {
        database: dbStatus,
        redis: redisStatus,
      },
    };
  }
}
