# @saas-chassis/sdk

NestJS middleware package for the SaaS Chassis platform. It wires multi-tenancy
(RLS context propagation), JWT authentication, role/permission/feature-flag
guards, audit logging, and response envelope formatting into any NestJS service
with a single `ChassisModule.forRoot()` call.

## Installation

```bash
npm install @saas-chassis/sdk
```

## Quick start

```typescript
import { ChassisModule } from '@saas-chassis/sdk';

@Module({
  imports: [
    ChassisModule.forRoot({
      serviceName: 'my-service',
      jwtSecret: process.env.JWT_SECRET,
      tenantManagerUrl: process.env.TENANT_MANAGER_URL,
      rabbitmqUrl: process.env.RABBITMQ_URL,
      redisUrl: process.env.REDIS_URL,
      enableAuditLogging: true,
      enableFeatureGating: true,
    }),
  ],
})
export class AppModule {}
```

## Available exports

| Category      | Export |
|---------------|--------|
| Module        | `ChassisModule` |
| Guards        | `JwtAuthGuard`, `RolesGuard`, `PermissionsGuard`, `FeatureGateGuard` |
| Interceptors  | `ResponseEnvelopeInterceptor`, `AuditInterceptor`, `TimeoutInterceptor` |
| Decorators    | `CurrentUser`, `CurrentTenant`, `Roles`, `RequirePermission`, `RequireFeature`, `AuditLog`, `Public` |
| Database      | `TenantAwareRepository`, `TenantScopedEntity`, `setRlsContext`, `tenantStorage` |
| Middleware     | `TenantContextMiddleware`, `RequestIdMiddleware` |
| Services      | `FeatureFlagService`, `AuditPublisherService`, `InternalHttpService` |
| Pipes/Filters | `ChassisValidationPipe`, `GlobalExceptionFilter` |
| DTOs/Types    | `ApiResponseDto`, `PaginationQueryDto`, `TenantContextDto`, `JwtPayload` |

## `ChassisOptions` fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `serviceName` | `string` | yes | Identifies the service in logs and audit events |
| `jwtSecret` | `string` | no | Shared JWT signing secret |
| `tenantManagerUrl` | `string` | no | Base URL for tenant-manager feature-flag queries |
| `rabbitmqUrl` | `string` | no | AMQP URL for audit and event publishing |
| `redisUrl` | `string` | no | Redis URL for feature-flag caching |
| `serviceToken` | `string` | no | Bearer token for internal service-to-service calls |
| `enableAuditLogging` | `boolean` | no | Mount `AuditInterceptor` globally (default: false) |
| `enableFeatureGating` | `boolean` | no | Enable `FeatureGateGuard` globally (default: false) |
| `requestTimeoutMs` | `number` | no | Global request timeout in ms (default: 30000) |

## Full documentation

See [CHASSIS-USER-GUIDE.md](../../docs/CHASSIS-USER-GUIDE.md).
