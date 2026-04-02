import { registerAs } from '@nestjs/config';

export default registerAs('app', () => ({
  port: parseInt(process.env.PORT ?? '3003', 10),
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
  stripe: {
    secretKey: process.env.STRIPE_SECRET_KEY ?? '',
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET ?? '',
    successUrl: process.env.STRIPE_SUCCESS_URL ?? 'http://localhost:3000/billing/success',
    cancelUrl: process.env.STRIPE_CANCEL_URL ?? 'http://localhost:3000/billing/cancel',
    portalReturnUrl: process.env.STRIPE_PORTAL_RETURN_URL ?? 'http://localhost:3000/billing',
  },
  internalServiceToken: process.env.INTERNAL_SERVICE_TOKEN ?? 'changeme-internal-token',
}));
