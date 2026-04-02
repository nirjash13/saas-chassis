import { ValidationPipe } from '@nestjs/common';

/**
 * Pre-configured ValidationPipe for chassis services.
 * Enables class-validator transformations and strips unknown fields.
 */
export const ChassisValidationPipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: false,
  transform: true,
  transformOptions: {
    enableImplicitConversion: false,
  },
});
