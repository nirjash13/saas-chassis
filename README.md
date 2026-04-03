# SaaS Chassis

A reusable, multi-tenant backend platform that any SaaS product can plug into. Instead of rebuilding authentication, billing, audit logging, and tenant management for every product, you build them once here and connect your apps via the SDK. Think of it as the engine under the hood.

## What's Inside

The platform consists of six microservices built with different languages and frameworks, all working together:

| Service              | Language            | Port | Purpose                                                                      |
| -------------------- | ------------------- | ---- | ---------------------------------------------------------------------------- |
| **Identity Service** | TypeScript / NestJS | 3001 | Authentication, JWT tokens, roles & permissions, user impersonation          |
| **Tenant Manager**   | TypeScript / NestJS | 3002 | Create and manage tenants (organizations), feature flags, subscription plans |
| **Billing Engine**   | TypeScript / NestJS | 3003 | Stripe integration, subscription lifecycle, invoices, revenue analytics      |
| **API Gateway**      | Go / Gin            | 8080 | Single entry point for all requests, JWT validation, rate limiting           |
| **Audit Service**    | Go                  | 3005 | High-throughput immutable event log, searchable per tenant                   |
| **Universal Ledger** | C# / .NET 8         | 3006 | Double-entry bookkeeping for financial tracking                              |

All requests from client applications go through the **API Gateway** on port 8080. The individual service ports are for direct backend-to-backend communication.

### Shared Infrastructure

- **PostgreSQL 16** — Multi-schema database with Row-Level Security (RLS) for automatic tenant data isolation
- **Redis 7** — Token blacklist, rate limiting, caching
- **RabbitMQ 3.13** — Async event messaging between services
- **Seq** — Structured log aggregation with a searchable UI

### The Chassis SDK

Your product's NestJS backend imports `@saas-chassis/sdk` (an npm package) to automatically get:

- Multi-tenancy with RLS
- JWT authentication guards
- Audit logging decorators
- Response envelope formatting
- Tenant-scoped data repositories

## Key Concepts

**Tenant** — An organization or company using your product. All tenant data is isolated at the database level via PostgreSQL Row-Level Security — the database itself enforces that each tenant can only see their own data.

**Member** — A user who belongs to a tenant. Users can belong to multiple tenants and have different roles in each.

**Role** — A named group of permissions (e.g., "admin", "viewer"). Assigned per membership in a tenant.

**Feature Flag** — A toggleable capability per tenant. Plans automatically enable features (e.g., the "pro" plan enables "advanced-reports").

**Platform Admin** — A special user who can manage all tenants and view cross-tenant data.

**JWT Token** — Issued at login. Contains userId, tenantId, roles, and permissions. Validated at the API Gateway.

**Event** — When something happens (tenant created, invoice paid), the service publishes an event to RabbitMQ. Other services listen and react independently.

## Getting Started

### Prerequisites

- Docker Desktop (for local development with all infrastructure)
- Git
- Node.js 20+ (for SDK development)
- Go 1.22+ (for gateway/audit service development)
- .NET 8 (for ledger service development)

### Quick Start

```bash
# Clone and setup
git clone <repo-url>
cd saas-chassis-code
cp .env.example .env

# Edit .env and set JWT_SECRET to a random 32+ character string
# Keep other defaults for local development

# Start everything
make up

# Verify all services are healthy
make health
```

The entire stack will be running. Visit the URLs below to verify:

- **API Gateway:** http://localhost:8080
- **RabbitMQ Management UI:** http://localhost:15672 (guest / guest)
- **Seq (logs):** http://localhost:5342

### Makefile Commands

```bash
make up              # Start all infrastructure and services
make down            # Stop all containers
make restart         # Restart everything
make logs            # Tail logs (add service=identity-service to filter)
make ps              # Show container status
make migrate         # Run database migrations
make health          # Check service connectivity
make clean           # DESTRUCTIVE: wipe all data volumes
```

## Test It Out

### Example: Register, Login, Create a Tenant

```bash
# 1. Register a user
curl -X POST http://localhost:8080/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"Secure1234!","displayName":"Admin User"}'

# 2. Login and get a token
curl -X POST http://localhost:8080/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"Secure1234!"}'

# Save the "accessToken" from the response

# 3. Create a tenant (as platform admin)
curl -X POST http://localhost:8080/api/v1/tenants \
  -H "Authorization: Bearer <your-token>" \
  -H "Content-Type: application/json" \
  -d '{"name":"Acme Corp","slug":"acme","adminEmail":"admin@acme.com","planCode":"starter"}'

# 4. Check your tenant context
curl http://localhost:8080/api/v1/auth/me \
  -H "Authorization: Bearer <your-token>"
```

## Building a Product on Chassis

### Step 1: Create Your Product Repository

```bash
mkdir my-product && cd my-product
npm init -y
npm install @saas-chassis/sdk @nestjs/core @nestjs/common typeorm pg
```

### Step 2: Import the Chassis Module

```typescript
// app.module.ts
import { ChassisModule } from "@saas-chassis/sdk";

@Module({
  imports: [
    ChassisModule.forRoot({
      jwtSecret: process.env.JWT_SECRET,
      rabbitMqUrl: process.env.RABBITMQ_URL,
      redisUrl: process.env.REDIS_URL,
    }),
    // ... your feature modules
  ],
})
export class AppModule {}
```

### Step 3: Use SDK Guards and Decorators

```typescript
import {
  CurrentUser,
  RequirePermission,
  RequireFeature,
} from "@saas-chassis/sdk";

@Controller("properties")
export class PropertiesController {
  constructor(private propertiesService: PropertiesService) {}

  @Get()
  @RequirePermission("properties:read") // Enforces permission
  @RequireFeature("property-management") // Enforces feature flag
  async getProperties(@CurrentUser() user: JwtPayload) {
    // user.tenantId, user.userId, user.roles automatically available
    return this.propertiesService.findAll(user.tenantId);
  }
}
```

### Step 4: Use Tenant-Aware Entities

```typescript
import { TenantScopedEntity, TenantAwareRepository } from "@saas-chassis/sdk";

@Entity("properties")
export class Property extends TenantScopedEntity {
  @Column() name: string;
  @Column() address: string;
}

// TenantAwareRepository automatically applies RLS
// No WHERE tenant_id = ? needed — the database enforces it
```

### Step 5: Register Your Routes in the Gateway

Add your service to the environment:

```bash
# In .env
PRODUCT_ROUTES=/api/v1/properties=http://my-product:3010,/api/v1/units=http://my-product:3010
```

The gateway will route `/api/v1/properties/*` to your service.

## API Quick Reference

All endpoints use the standard response envelope:

```json
{
  "success": true,
  "data": { ... },
  "meta": { "requestId": "...", "timestamp": "..." }
}
```

### Auth & Identity

Prefix: `/api/v1`

- `POST /auth/register` — Create account
- `POST /auth/login` — Get JWT token
- `POST /auth/refresh` — Refresh expired token
- `POST /auth/logout` — Invalidate token
- `POST /auth/switch-tenant` — Switch active tenant
- `GET /auth/me` — Current user + tenant context
- `GET/POST/PATCH/DELETE /users` — User management (admin)
- `GET/POST/PATCH/DELETE /roles` — Role management (admin)
- `POST /impersonate/:userId` — Impersonate user (platform admin)

### Tenants

Prefix: `/api/v1`

- `GET/POST /tenants` — List/create tenants
- `GET/PATCH/DELETE /tenants/:id` — Manage tenant
- `POST /tenants/:id/features` — Toggle feature flags
- `GET /plans` — Available subscription plans

### Billing

Prefix: `/api/v1`

- `GET /billing/subscriptions/:tenantId` — Current subscription
- `POST /billing/checkout` — Create Stripe checkout session
- `POST /billing/portal` — Create customer portal session
- `GET /billing/invoices/:tenantId` — Invoice history
- `GET /billing/revenue/summary` — Revenue analytics (platform admin)

### Audit

Prefix: `/api/v1`

- `GET /audit/entries` — Query audit log (paginated, tenant-scoped)

### Ledger

Prefix: `/api/v1`

- `GET/POST /ledger/accounts` — Chart of accounts
- `GET/POST /ledger/entries` — Journal entries
- `POST /ledger/entries/:id/post` — Post a draft entry
- `POST /ledger/entries/:id/reverse` — Reverse a posted entry
- `GET /ledger/reports/trial-balance` — Trial balance
- `GET /ledger/reports/pnl` — Profit & loss
- `GET /ledger/reports/balance-sheet` — Balance sheet

## Documentation

## Project Status

## Support
