import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const logger = new Logger('Bootstrap');

  // rawBody: true is required for Stripe webhook signature verification
  const app = await NestFactory.create(AppModule, { rawBody: true });

  const configService = app.get(ConfigService);

  // ── Security ────────────────────────────────────────────────────────────────
  app.use(helmet());
  app.enableCors({
    origin: process.env.ALLOWED_ORIGINS?.split(',') ?? ['http://localhost:3000'],
    credentials: true,
  });

  // ── Validation ───────────────────────────────────────────────────────────────
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // ── RabbitMQ Microservice (event consumer) ────────────────────────────────────
  const rabbitmqUrl =
    configService.get<string>('app.rabbitmq.url') ?? 'amqp://guest:guest@localhost:5672';

  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.RMQ,
    options: {
      urls: [rabbitmqUrl],
      queue: 'billing_consumer_queue',
      queueOptions: { durable: true },
      noAck: false,
    },
  });

  await app.startAllMicroservices();

  // ── Start HTTP server ─────────────────────────────────────────────────────────
  const port = configService.get<number>('app.port') ?? 3003;
  await app.listen(port);

  logger.log(`Billing Engine Service listening on port ${port}`);
  logger.log(`Environment: ${configService.get<string>('app.nodeEnv')}`);
}

bootstrap().catch((err: Error) => {
  new Logger('Bootstrap').error('Failed to start application', err.stack);
  process.exit(1);
});
