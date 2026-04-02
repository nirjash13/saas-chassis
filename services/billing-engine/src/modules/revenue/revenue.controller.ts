import {
  Controller,
  ForbiddenException,
  Get,
  Query,
  Request,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { RevenueService } from './revenue.service';
import { ApiResponseDto } from '../../common/dto/api-response.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { TenantContextInterceptor } from '../../common/interceptors/tenant-context.interceptor';
import { JwtPayload } from '../auth/jwt.strategy';

interface RequestWithUser extends Request {
  user: JwtPayload;
}

@Controller('api/v1/billing')
@UseGuards(JwtAuthGuard)
@UseInterceptors(TenantContextInterceptor)
export class RevenueController {
  constructor(private readonly revenueService: RevenueService) {}

  /**
   * GET /api/v1/billing/revenue
   * Platform-wide revenue analytics. Platform admin only.
   */
  @Get('revenue')
  async getRevenue(
    @Request() req: RequestWithUser,
    @Query('period') period: 'daily' | 'monthly' | 'yearly' = 'monthly',
  ): Promise<ApiResponseDto<unknown>> {
    if (!req.user.isPlatformAdmin) {
      throw new ForbiddenException('Revenue analytics requires platform admin');
    }

    const validPeriods = ['daily', 'monthly', 'yearly'];
    const safePeriod = validPeriods.includes(period) ? period : 'monthly';

    const summary = await this.revenueService.getRevenueSummary(
      safePeriod as 'daily' | 'monthly' | 'yearly',
    );
    return ApiResponseDto.ok(summary);
  }
}
