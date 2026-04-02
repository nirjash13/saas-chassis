import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Invoice } from '../invoices/entities/invoice.entity';
import { Subscription } from '../subscriptions/entities/subscription.entity';
import { RevenueService } from './revenue.service';
import { RevenueController } from './revenue.controller';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Invoice, Subscription]),
    AuthModule,
  ],
  controllers: [RevenueController],
  providers: [RevenueService],
})
export class RevenueModule {}
