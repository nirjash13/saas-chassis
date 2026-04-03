import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  ParseUUIDPipe,
  Put,
  Request,
  UseGuards,
} from '@nestjs/common';
import { FeaturesService } from './features.service';
import { ToggleFeatureDto } from './dto/toggle-feature.dto';
import { ApiResponseDto } from '../../common/dto/api-response.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { InternalServiceGuard } from '../../common/guards/internal-service.guard';
import { JwtPayload } from '../auth/jwt.strategy';

interface RequestWithUser extends Request {
  user: JwtPayload;
}

@Controller('api/v1')
export class FeaturesController {
  constructor(private readonly featuresService: FeaturesService) {}

  /**
   * GET /api/v1/features
   * List all feature definitions. Available to any authenticated user.
   */
  @Get('features')
  @UseGuards(JwtAuthGuard)
  async findAllDefinitions(): Promise<ApiResponseDto<unknown>> {
    const definitions = await this.featuresService.findAllDefinitions();
    return ApiResponseDto.ok(definitions);
  }

  /**
   * GET /api/v1/tenants/:id/features
   * List features with tenant-specific toggle status.
   * Accessible by platform_admin or the tenant's own admin.
   */
  @Get('tenants/:id/features')
  @UseGuards(JwtAuthGuard)
  async findTenantFeatures(
    @Param('id', ParseUUIDPipe) tenantId: string,
    @Request() req: RequestWithUser,
  ): Promise<ApiResponseDto<unknown>> {
    const user = req.user;
    // Enforce tenant isolation: non-platform admins can only view their own tenant
    if (!user.isPlatformAdmin && user.tenantId !== tenantId) {
      throw new ForbiddenException('Access denied to this tenant');
    }
    const features = await this.featuresService.findTenantFeatures(tenantId);
    return ApiResponseDto.ok(features);
  }

  /**
   * PUT /api/v1/tenants/:id/features/:code
   * Enable or disable a feature for a tenant. Platform admin only.
   */
  @Put('tenants/:id/features/:code')
  @UseGuards(JwtAuthGuard)
  async toggleFeature(
    @Param('id', ParseUUIDPipe) tenantId: string,
    @Param('code') featureCode: string,
    @Body() dto: ToggleFeatureDto,
    @Request() req: RequestWithUser,
  ): Promise<ApiResponseDto<unknown>> {
    const user = req.user;
    if (!user.isPlatformAdmin) {
      throw new ForbiddenException('Only platform admins can toggle features');
    }
    const result = await this.featuresService.toggleFeature(
      tenantId,
      featureCode,
      dto,
      user.sub,
    );
    return ApiResponseDto.ok(result);
  }

  /**
   * GET /api/v1/tenants/:id/features/:code/check
   * Check if a specific feature is enabled for a tenant.
   * Used by the SDK — protected by X-Service-Token.
   */
  @Get('tenants/:id/features/:code/check')
  @UseGuards(InternalServiceGuard)
  async checkFeature(
    @Param('id', ParseUUIDPipe) tenantId: string,
    @Param('code') featureCode: string,
  ): Promise<ApiResponseDto<{ enabled: boolean }>> {
    const enabled = await this.featuresService.isFeatureEnabled(tenantId, featureCode);
    return ApiResponseDto.ok({ enabled });
  }
}
