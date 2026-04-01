import { SetMetadata } from '@nestjs/common';

export const PERMISSIONS_KEY = 'required_permissions';

export const RequirePermission = (resource: string, action: string) =>
  SetMetadata(PERMISSIONS_KEY, `${resource}:${action}`);
