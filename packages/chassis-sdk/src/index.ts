// Module
export { ChassisModule } from './chassis.module';
export { ChassisOptions } from './config/chassis.config';

// Database / RLS
export { TenantAwareRepository } from './database/tenant-aware.repository';
export { TenantScopedEntity } from './database/base.entity';
export {
  tenantStorage,
  TenantContextData,
} from './database/tenant-context.subscriber';
export { setRlsContext } from './database/rls-connection';

// Middleware
export { TenantContextMiddleware } from './middleware/tenant-context.middleware';
export { RequestIdMiddleware } from './middleware/request-id.middleware';

// Decorators
export { CurrentUser, UserContext } from './decorators/current-user.decorator';
export { CurrentTenant } from './decorators/current-tenant.decorator';
export { Roles, ROLES_KEY } from './decorators/roles.decorator';
export {
  RequirePermission,
  PERMISSIONS_KEY,
} from './decorators/permissions.decorator';
export {
  RequireFeature,
  FEATURE_KEY,
} from './decorators/feature-gate.decorator';
export { AuditLog, AUDIT_ACTION_KEY } from './decorators/audit-log.decorator';

// Guards
export { JwtAuthGuard, Public, IS_PUBLIC_KEY } from './guards/jwt-auth.guard';
export { RolesGuard } from './guards/roles.guard';
export { PermissionsGuard } from './guards/permissions.guard';
export {
  FeatureGateGuard,
  FeatureFlagChecker,
} from './guards/feature-gate.guard';

// Interceptors
export {
  ResponseEnvelopeInterceptor,
  ApiResponse,
} from './interceptors/response-envelope.interceptor';
export {
  AuditInterceptor,
  AuditPublisher,
} from './interceptors/audit.interceptor';
export { TimeoutInterceptor } from './interceptors/timeout.interceptor';

// Filters
export { GlobalExceptionFilter } from './filters/global-exception.filter';

// Pipes
export { ChassisValidationPipe } from './pipes/validation.pipe';

// Services
export { FeatureFlagService } from './services/feature-flag.service';
export { AuditPublisherService, AuditEvent } from './services/audit-publisher.service';
export { InternalHttpService, InternalRequestOptions } from './services/internal-http.service';

// DTOs
export { ApiResponseDto, PaginationMeta } from './dto/api-response.dto';
export { PaginationQueryDto } from './dto/pagination.dto';
export { TenantContextDto } from './dto/tenant-context.dto';

// Types
export { TenantContext } from './types/tenant-context.interface';
export { JwtPayload } from './types/jwt-payload.interface';
