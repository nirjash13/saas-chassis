export interface JwtPayload {
  sub: string;
  email: string;
  displayName: string;
  isPlatformAdmin: boolean;
  tenantId: string | null;
  tenantSlug: string | null;
  roles: string[];
  permissions: string[];
  isImpersonating: boolean;
  realUserId?: string;
  iat: number;
  exp: number;
}
