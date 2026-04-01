import { registerAs } from '@nestjs/config';

export default registerAs('app', () => ({
  port: parseInt(process.env.PORT ?? '3001', 10),
  nodeEnv: process.env.NODE_ENV ?? 'development',
  jwt: {
    secret: process.env.JWT_SECRET ?? 'changeme-super-secret-at-least-32-chars!!',
    expiry: process.env.JWT_EXPIRY ?? '15m',
    refreshExpiry: process.env.JWT_REFRESH_EXPIRY ?? '7d',
    impersonationExpiry: '30m',
  },
  redis: {
    url: process.env.REDIS_URL ?? 'redis://localhost:6379',
  },
  rabbitmq: {
    url: process.env.RABBITMQ_URL ?? 'amqp://guest:guest@localhost:5672',
  },
  bcrypt: {
    saltRounds: 12,
  },
  rateLimit: {
    loginMaxAttempts: 5,
    loginBlockDurationSeconds: 15 * 60, // 15 minutes
  },
}));
