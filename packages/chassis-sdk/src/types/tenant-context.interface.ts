export interface TenantContext {
  tenantId: string;
  tenantSlug: string;
  userId: string;
  roles: string[];
  isPlatformAdmin: boolean;
  permissions: string[];
}
