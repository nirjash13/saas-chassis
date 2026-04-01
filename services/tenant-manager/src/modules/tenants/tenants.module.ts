import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TenantsController } from './tenants.controller';
import { TenantsService } from './tenants.service';
import { Tenant } from './entities/tenant.entity';
import { PlansModule } from '../plans/plans.module';
import { FeaturesModule } from '../features/features.module';
import { AuthModule } from '../auth/auth.module';
import { BillingEventsController } from '../messaging/billing-events.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([Tenant]),
    PlansModule,
    FeaturesModule,
    AuthModule,
  ],
  controllers: [TenantsController, BillingEventsController],
  providers: [TenantsService],
  exports: [TenantsService],
})
export class TenantsModule {}
