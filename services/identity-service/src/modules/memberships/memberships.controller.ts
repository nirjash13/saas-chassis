import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { MembershipsService } from './memberships.service';
import { CreateMembershipDto } from './dto/create-membership.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermission } from '../../common/decorators/permissions.decorator';
import { ApiResponseDto } from '../../common/dto/api-response.dto';

@Controller('api/v1/memberships')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class MembershipsController {
  constructor(private readonly membershipsService: MembershipsService) {}

  @Get('user/:userId')
  @RequirePermission('users', 'read')
  async findByUser(@Param('userId', ParseUUIDPipe) userId: string) {
    const memberships = await this.membershipsService.findByUserId(userId);
    return ApiResponseDto.ok(memberships);
  }

  @Get('tenant/:tenantId')
  @RequirePermission('users', 'read')
  async findByTenant(@Param('tenantId', ParseUUIDPipe) tenantId: string) {
    const memberships =
      await this.membershipsService.findByTenantId(tenantId);
    return ApiResponseDto.ok(memberships);
  }

  @Post()
  @RequirePermission('users', 'manage')
  async create(@Body() dto: CreateMembershipDto) {
    const membership = await this.membershipsService.create(dto);
    return ApiResponseDto.created(membership);
  }

  @Delete('user/:userId/tenant/:tenantId')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('users', 'manage')
  async remove(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
  ) {
    await this.membershipsService.remove(userId, tenantId);
    return ApiResponseDto.ok(null, 'Membership removed successfully');
  }
}
