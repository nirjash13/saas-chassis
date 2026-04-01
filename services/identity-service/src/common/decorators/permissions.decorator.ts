import { SetMetadata } from '@nestjs/common';

export const PERMISSIONS_KEY = 'permissions';

/**
 * Requires a specific permission string e.g. @RequirePermission('ledger', 'write')
 * which becomes 'ledger:write' in the JWT permissions array.
 */
export const RequirePermission = (resource: string, action: string) =>
  SetMetadata(PERMISSIONS_KEY, [`${resource}:${action}`]);

export const RequirePermissions = (...permissions: string[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);
