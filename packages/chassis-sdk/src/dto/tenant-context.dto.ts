export class TenantContextDto {
  tenantId!: string;
  tenantSlug!: string;
  userId!: string;
  roles!: string[];
  permissions!: string[];
  isPlatformAdmin!: boolean;
}
