import {
  Body,
  Controller,
  forwardRef,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { RolesService } from './roles.service';
import { AssignRoleDto } from './dto/assign-role.dto';
import { MembershipsService } from '../memberships/memberships.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { RequirePermission } from '../../common/decorators/permissions.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { ApiResponseDto } from '../../common/dto/api-response.dto';

@Controller('api/v1/roles')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
export class RolesController {
  constructor(
    private readonly rolesService: RolesService,
    @Inject(forwardRef(() => MembershipsService))
    private readonly membershipsService: MembershipsService,
  ) {}

  @Get()
  @RequirePermission('users', 'read')
  async findAll(@Query('tenantId') tenantId?: string) {
    const roles = await this.rolesService.findAll(tenantId);
    return ApiResponseDto.ok(roles);
  }

  @Get('permissions')
  @RequirePermission('users', 'read')
  async findAllPermissions() {
    const permissions = await this.rolesService.findAllPermissions();
    return ApiResponseDto.ok(permissions);
  }

  @Get(':id')
  @RequirePermission('users', 'read')
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    const role = await this.rolesService.findById(id);
    return ApiResponseDto.ok(role);
  }

  @Post('assign')
  @Roles('tenant_admin', 'platform_admin')
  async assignRole(@Body() dto: AssignRoleDto) {
    const membership = await this.membershipsService.findByUserAndTenant(
      dto.userId,
      dto.tenantId,
    );

    if (membership) {
      // Update existing membership role
      membership.roleId = dto.roleId;
      // Re-save by removing and re-creating (simplest approach with TypeORM)
      await this.membershipsService.remove(dto.userId, dto.tenantId);
    }

    const newMembership = await this.membershipsService.create({
      userId: dto.userId,
      tenantId: dto.tenantId,
      roleId: dto.roleId,
    });

    return ApiResponseDto.ok(newMembership, 'Role assigned successfully');
  }
}
