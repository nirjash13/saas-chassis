import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermission } from '../../common/decorators/permissions.decorator';
import { ApiResponseDto } from '../../common/dto/api-response.dto';
import { JwtPayload } from '../auth/strategies/jwt.strategy';

@Controller('api/v1/users')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @RequirePermission('users', 'read')
  async findAll(@CurrentUser() user: JwtPayload) {
    const users = await this.usersService.findAll({
      isPlatformAdmin: user.isPlatformAdmin,
      tenantId: user.tenantId,
    });
    return ApiResponseDto.ok(users);
  }

  @Get(':id')
  @RequirePermission('users', 'read')
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    const user = await this.usersService.findById(id);
    return ApiResponseDto.ok(user);
  }

  @Post()
  @RequirePermission('users', 'write')
  async create(@Body() dto: CreateUserDto) {
    const user = await this.usersService.create(dto);
    return ApiResponseDto.created(user);
  }

  @Patch(':id')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser() currentUser: JwtPayload,
  ) {
    // Allow self-update OR require users:write permission
    const isSelf = currentUser.sub === id;
    const hasPermission =
      currentUser.isPlatformAdmin ||
      currentUser.permissions.includes('users:write');

    if (!isSelf && !hasPermission) {
      throw new ForbiddenException(
        'You can only update your own profile or must have users:write permission',
      );
    }

    const user = await this.usersService.update(id, dto);
    return ApiResponseDto.ok(user);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('users', 'delete')
  async remove(@Param('id', ParseUUIDPipe) id: string) {
    await this.usersService.softDelete(id);
    return ApiResponseDto.ok(null, 'User deleted successfully');
  }
}
