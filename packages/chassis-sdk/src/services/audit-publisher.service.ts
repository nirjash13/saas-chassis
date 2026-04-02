import { Injectable, Inject, Optional, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { connect, AmqpConnectionManager, ChannelWrapper } from 'amqp-connection-manager';
import type { Channel, Options } from 'amqplib';
import { ChassisOptions } from '../config/chassis.config';

export interface AuditEvent {
  tenantId: string;
  userId: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  changes?: Record<string, unknown>;
  requestId?: string;
  serviceName: string;
  timestamp?: string;
}

@Injectable()
export class AuditPublisherService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AuditPublisherService.name);
  private connection?: AmqpConnectionManager;
  private channel?: ChannelWrapper;
  private readonly exchange = 'chassis.audit';

  constructor(
    @Optional()
    @Inject('CHASSIS_OPTIONS')
    private readonly options?: ChassisOptions,
  ) {}

  async onModuleInit(): Promise<void> {
    if (!this.options?.rabbitmqUrl || !this.options?.enableAuditLogging) return;

    this.connection = connect([this.options.rabbitmqUrl]);
    this.channel = this.connection.createChannel({
      setup: async (ch: Channel) => {
        await ch.assertExchange(this.exchange, 'fanout', { durable: true } as Options.AssertExchange);
      },
    });

    this.logger.log('AuditPublisherService connected to RabbitMQ');
  }

  async onModuleDestroy(): Promise<void> {
    await this.channel?.close();
    await this.connection?.close();
  }

  publish(event: AuditEvent): void {
    if (!this.channel) return;

    const payload: AuditEvent = {
      ...event,
      timestamp: event.timestamp ?? new Date().toISOString(),
    };

    this.channel
      .publish(
        this.exchange,
        '',
        Buffer.from(JSON.stringify(payload)),
        { persistent: true },
      )
      .catch((err: Error) => {
        this.logger.warn(`Failed to publish audit event: ${err.message}`);
      });
  }
}
