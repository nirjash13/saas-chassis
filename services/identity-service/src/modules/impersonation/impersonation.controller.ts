import {
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ImpersonationService } from './impersonation.service';
import { ImpersonateDto } from './dto/impersonate.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ApiResponseDto } from '../../common/dto/api-response.dto';
import { JwtPayload } from '../auth/strategies/jwt.strategy';

@Controller('api/v1/impersonate')
@UseGuards(JwtAuthGuard)
export class ImpersonationController {
  constructor(private readonly impersonationService: ImpersonationService) {}

  /**
   * POST /api/v1/impersonate
   * Start an impersonation session (platform_admin only)
   */
  @Post()
  @HttpCode(HttpStatus.OK)
  async startImpersonation(
    @CurrentUser() user: JwtPayload,
    @Body() dto: ImpersonateDto,
  ) {
    const result = await this.impersonationService.startImpersonation(user, dto);
    return ApiResponseDto.ok(result, 'Impersonation session started');
  }

  /**
   * DELETE /api/v1/impersonate
   * End the current impersonation session, return admin token
   */
  @Delete()
  @HttpCode(HttpStatus.OK)
  async endImpersonation(@CurrentUser() user: JwtPayload) {
    const result = await this.impersonationService.endImpersonation(user);
    return ApiResponseDto.ok(result, 'Impersonation session ended');
  }
}
