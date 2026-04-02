import {
  Controller,
  ForbiddenException,
  Get,
  Query,
  Request,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { InvoicesService } from './invoices.service';
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
export class InvoicesController {
  constructor(private readonly invoicesService: InvoicesService) {}

  /**
   * GET /api/v1/billing/invoices
   * List invoices for the current tenant. Requires billing:read.
   */
  @Get('invoices')
  async listInvoices(
    @Request() req: RequestWithUser,
    @Query('page') page = '1',
    @Query('limit') limit = '20',
  ): Promise<ApiResponseDto<unknown[]>> {
    const tenantId = req.user.tenantId;
    if (!tenantId) {
      throw new ForbiddenException('No tenant context in token');
    }

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));

    const result = await this.invoicesService.findByTenantId(tenantId, pageNum, limitNum);
    return ApiResponseDto.paginated(result.items, result.total, result.page, result.limit);
  }
}
