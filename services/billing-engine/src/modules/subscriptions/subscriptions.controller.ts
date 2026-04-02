import {
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Request,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { SubscriptionsService } from './subscriptions.service';
import { StripeService } from '../stripe/stripe.service';
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
export class SubscriptionsController {
  constructor(
    private readonly subscriptionsService: SubscriptionsService,
    private readonly stripeService: StripeService,
  ) {}

  /**
   * GET /api/v1/billing/subscription
   * Returns the current tenant's subscription record.
   * Requires billing:read (any authenticated tenant user).
   */
  @Get('subscription')
  async getSubscription(
    @Request() req: RequestWithUser,
  ): Promise<ApiResponseDto<unknown>> {
    const tenantId = req.user.tenantId;
    if (!tenantId) {
      throw new ForbiddenException('No tenant context in token');
    }
    const subscription = await this.subscriptionsService.findByTenantId(tenantId);
    return ApiResponseDto.ok(subscription);
  }

  /**
   * POST /api/v1/billing/checkout
   * Creates a Stripe Checkout session for plan upgrade.
   * Requires billing:manage (tenant user with sufficient role).
   */
  @Post('checkout')
  @HttpCode(HttpStatus.OK)
  async createCheckout(
    @Request() req: RequestWithUser,
  ): Promise<ApiResponseDto<{ url: string }>> {
    const tenantId = req.user.tenantId;
    if (!tenantId) {
      throw new ForbiddenException('No tenant context in token');
    }

    const subscription = await this.subscriptionsService.findByTenantId(tenantId);
    const sessionUrl = await this.stripeService.createCheckoutSession(
      subscription.stripeCustomerId,
      tenantId,
    );

    return ApiResponseDto.ok({ url: sessionUrl });
  }

  /**
   * POST /api/v1/billing/portal
   * Creates a Stripe Customer Portal session.
   * Requires billing:manage (tenant user with sufficient role).
   */
  @Post('portal')
  @HttpCode(HttpStatus.OK)
  async createPortal(
    @Request() req: RequestWithUser,
  ): Promise<ApiResponseDto<{ url: string }>> {
    const tenantId = req.user.tenantId;
    if (!tenantId) {
      throw new ForbiddenException('No tenant context in token');
    }

    const subscription = await this.subscriptionsService.findByTenantId(tenantId);
    const portalUrl = await this.stripeService.createCustomerPortalSession(
      subscription.stripeCustomerId,
    );

    return ApiResponseDto.ok({ url: portalUrl });
  }
}
