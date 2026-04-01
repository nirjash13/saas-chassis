import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FeaturesController } from './features.controller';
import { FeaturesService } from './features.service';
import { FeatureDefinition } from './entities/feature-definition.entity';
import { TenantFeature } from './entities/tenant-feature.entity';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [TypeOrmModule.forFeature([FeatureDefinition, TenantFeature]), AuthModule],
  controllers: [FeaturesController],
  providers: [FeaturesService],
  exports: [FeaturesService],
})
export class FeaturesModule {}
