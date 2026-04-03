import { Global, Module } from '@nestjs/common';
import { RabbitMqPublisherService } from './rabbitmq-publisher.service';

@Global()
@Module({
  providers: [RabbitMqPublisherService],
  exports: [RabbitMqPublisherService],
})
export class MessagingModule {}
