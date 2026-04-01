import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Request } from 'express';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto, SwitchTenantDto } from './dto/token-response.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ApiResponseDto } from '../../common/dto/api-response.dto';
import { User } from '../users/entities/user.entity';
import { JwtPayload } from './strategies/jwt.strategy';

@Controller('api/v1/auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  async register(@Body() dto: RegisterDto) {
    const result = await this.authService.register(dto);
    return ApiResponseDto.created(result);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthGuard('local'))
  async login(
    @Req() req: Request & { user: User },
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    @Body() _dto: LoginDto,
  ) {
    const ipAddress =
      (req.headers['x-forwarded-for'] as string) ??
      req.socket?.remoteAddress;
    const deviceInfo = req.headers['user-agent'];

    const result = await this.authService.login(
      req.user,
      ipAddress,
      deviceInfo,
    );
    return ApiResponseDto.ok(result, 'Login successful');
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Body() dto: RefreshTokenDto) {
    const result = await this.authService.refreshAccessToken(dto.refreshToken);
    return ApiResponseDto.ok(result);
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  async logout(@Body() dto: RefreshTokenDto) {
    await this.authService.logout(dto.refreshToken);
    return ApiResponseDto.ok(null, 'Logged out successfully');
  }

  @Post('switch-tenant')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  async switchTenant(
    @CurrentUser() user: JwtPayload,
    @Body() dto: SwitchTenantDto,
  ) {
    const result = await this.authService.switchTenant(user.sub, dto.tenantId);
    return ApiResponseDto.ok(result, 'Tenant switched successfully');
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async me(@CurrentUser() user: JwtPayload) {
    const profile = await this.authService.getMe(user.sub);
    return ApiResponseDto.ok(profile);
  }
}
