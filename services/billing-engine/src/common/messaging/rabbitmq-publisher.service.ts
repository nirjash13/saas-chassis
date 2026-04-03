import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as amqplib from 'amqplib';

@Injectable()
export class RabbitMqPublisherService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RabbitMqPublisherService.name);
  private connection: amqplib.Connection | null = null;
  private channel: amqplib.Channel | null = null;

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit(): Promise<void> {
    const url =
      this.configService.get<string>('app.rabbitmq.url') ??
      'amqp://guest:guest@localhost:5672';
    try {
      this.connection = await amqplib.connect(url);
      this.channel = await this.connection.createChannel();
      await this.channel.assertExchange('chassis.audit', 'fanout', { durable: true });
      await this.channel.assertExchange('chassis.tenants', 'topic', { durable: true });
      await this.channel.assertExchange('chassis.billing', 'topic', { durable: true });
      this.logger.log('RabbitMQ publisher connected');
    } catch (err) {
      this.logger.warn(
        `RabbitMQ publisher failed to connect: ${(err as Error).message}`,
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    try {
      await this.channel?.close();
    } catch (_) {
      // ignore close errors
    }
    try {
      await this.connection?.close();
    } catch (_) {
      // ignore close errors
    }
  }

  isConnected(): boolean {
    return this.channel !== null;
  }

  publish(exchange: string, routingKey: string, message: object): void {
    if (!this.channel) {
      this.logger.warn(`Cannot publish to ${exchange}: no channel`);
      return;
    }
    try {
      const buffer = Buffer.from(JSON.stringify(message));
      this.channel.publish(exchange, routingKey, buffer, {
        persistent: true,
        contentType: 'application/json',
      });
    } catch (err) {
      this.logger.warn(
        `Failed to publish to ${exchange}: ${(err as Error).message}`,
      );
    }
  }
}
