import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';

async function bootstrap() {
  const logger = new Logger('Bootstrap');

  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log', 'verbose', 'debug'],
  });

  const configService = app.get(ConfigService);
  const port = configService.get<number>('app.port') ?? 3001;
  const nodeEnv = configService.get<string>('app.nodeEnv') ?? 'development';

  // Security
  app.use(helmet());

  // CORS - allow all origins in dev, configure in prod
  app.enableCors({
    origin:
      nodeEnv === 'production'
        ? (process.env.CORS_ORIGINS ?? '').split(',').filter(Boolean)
        : true,
    credentials: true,
  });

  // Global validation pipe
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

  // Global exception filter
  app.useGlobalFilters(new GlobalExceptionFilter());

  await app.listen(port);
  logger.log(`Identity Service running on port ${port} [${nodeEnv}]`);
  logger.log(`Health check: http://localhost:${port}/health`);
}

bootstrap().catch((err) => {
  console.error('Failed to start Identity Service', err);
  process.exit(1);
});
