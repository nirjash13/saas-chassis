import { registerAs } from '@nestjs/config';

export default registerAs('app', () => ({
  port: parseInt(process.env.PORT ?? '3002', 10),
  nodeEnv: process.env.NODE_ENV ?? 'development',
  jwt: {
    secret: process.env.JWT_SECRET ?? 'changeme-super-secret-at-least-32-chars!!',
    expiry: process.env.JWT_EXPIRY ?? '15m',
  },
  redis: {
    url: process.env.REDIS_URL ?? 'redis://localhost:6379',
  },
  rabbitmq: {
    url: process.env.RABBITMQ_URL ?? 'amqp://guest:guest@localhost:5672',
  },
  internalServiceToken: process.env.INTERNAL_SERVICE_TOKEN ?? 'changeme-internal-token',
  identityServiceUrl: process.env.IDENTITY_SERVICE_URL ?? 'http://localhost:3001',
  featureCacheTtlSeconds: 300, // 5 minutes
}));
