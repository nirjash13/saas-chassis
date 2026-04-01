import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Request,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { TenantsService } from './tenants.service';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { UpdateTenantDto, SuspendTenantDto } from './dto/update-tenant.dto';
import { TenantResponseDto } from './dto/tenant-response.dto';
import { ApiResponseDto } from '../../common/dto/api-response.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantContextInterceptor } from '../../common/interceptors/tenant-context.interceptor';
import { JwtPayload } from '../auth/jwt.strategy';

interface RequestWithUser extends Request {
  user: JwtPayload;
}

@Controller('api/v1/tenants')
@UseGuards(JwtAuthGuard)
@UseInterceptors(TenantContextInterceptor)
export class TenantsController {
  constructor(private readonly tenantsService: TenantsService) {}

  /**
   * POST /api/v1/tenants
   * Provision a new tenant. Platform admin only.
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body() dto: CreateTenantDto,
    @Request() req: RequestWithUser,
  ): Promise<ApiResponseDto<TenantResponseDto>> {
    if (!req.user.isPlatformAdmin) {
      return ApiResponseDto.error('Only platform admins can provision tenants');
    }
    const tenant = await this.tenantsService.createTenant(dto, req.user.sub);
    return ApiResponseDto.created(TenantResponseDto.fromEntity(tenant));
  }

  /**
   * GET /api/v1/tenants
   * List all tenants (paginated). Platform admin only.
   */
  @Get()
  async findAll(
    @Query('page') page = '1',
    @Query('limit') limit = '20',
    @Request() req: RequestWithUser,
  ): Promise<ApiResponseDto<TenantResponseDto[]>> {
    if (!req.user.isPlatformAdmin) {
      return ApiResponseDto.error('Only platform admins can list all tenants');
    }
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));

    const result = await this.tenantsService.findAll(pageNum, limitNum);
    return ApiResponseDto.paginated(
      result.items.map(TenantResponseDto.fromEntity),
      result.total,
      result.page,
      result.limit,
    );
  }

  /**
   * GET /api/v1/tenants/:id
   * Get tenant details. Platform admin or tenant's own admin.
   */
  @Get(':id')
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req: RequestWithUser,
  ): Promise<ApiResponseDto<TenantResponseDto>> {
    const user = req.user;
    if (!user.isPlatformAdmin && user.tenantId !== id) {
      return ApiResponseDto.error('Access denied to this tenant');
    }
    const tenant = await this.tenantsService.findById(id);
    return ApiResponseDto.ok(TenantResponseDto.fromEntity(tenant));
  }

  /**
   * PATCH /api/v1/tenants/:id
   * Update tenant metadata/settings. Platform admin or tenant's own admin.
   */
  @Patch(':id')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTenantDto,
    @Request() req: RequestWithUser,
  ): Promise<ApiResponseDto<TenantResponseDto>> {
    const user = req.user;
    if (!user.isPlatformAdmin && user.tenantId !== id) {
      return ApiResponseDto.error('Access denied to this tenant');
    }
    // Only platform admins can change plan
    if (dto.plan && !user.isPlatformAdmin) {
      return ApiResponseDto.error('Only platform admins can change the subscription plan');
    }
    const tenant = await this.tenantsService.updateTenant(id, dto);
    return ApiResponseDto.ok(TenantResponseDto.fromEntity(tenant));
  }

  /**
   * POST /api/v1/tenants/:id/suspend
   * Suspend a tenant. Platform admin only.
   */
  @Post(':id/suspend')
  @HttpCode(HttpStatus.OK)
  async suspend(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SuspendTenantDto,
    @Request() req: RequestWithUser,
  ): Promise<ApiResponseDto<TenantResponseDto>> {
    if (!req.user.isPlatformAdmin) {
      return ApiResponseDto.error('Only platform admins can suspend tenants');
    }
    const tenant = await this.tenantsService.suspendTenant(id, dto);
    return ApiResponseDto.ok(TenantResponseDto.fromEntity(tenant));
  }

  /**
   * POST /api/v1/tenants/:id/activate
   * Re-activate a suspended tenant. Platform admin only.
   */
  @Post(':id/activate')
  @HttpCode(HttpStatus.OK)
  async activate(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req: RequestWithUser,
  ): Promise<ApiResponseDto<TenantResponseDto>> {
    if (!req.user.isPlatformAdmin) {
      return ApiResponseDto.error('Only platform admins can activate tenants');
    }
    const tenant = await this.tenantsService.activateTenant(id);
    return ApiResponseDto.ok(TenantResponseDto.fromEntity(tenant));
  }

  /**
   * DELETE /api/v1/tenants/:id
   * Archive/soft-delete a tenant. Platform admin only.
   */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req: RequestWithUser,
  ): Promise<void> {
    if (!req.user.isPlatformAdmin) {
      return;
    }
    await this.tenantsService.archiveTenant(id);
  }
}
