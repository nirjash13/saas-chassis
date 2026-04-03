import { SetMetadata } from '@nestjs/common';

export const PERMISSIONS_KEY = 'permissions';

/**
 * Specify one or more permission strings (e.g. 'billing:read') that the
 * caller must possess. The PermissionsGuard reads these from route metadata
 * and checks them against the JWT payload's permissions array.
 */
export const RequirePermissions = (...permissions: string[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);
