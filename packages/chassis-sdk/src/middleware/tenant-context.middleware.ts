import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import {
  tenantStorage,
  TenantContextData,
} from '../database/tenant-context.subscriber';

/**
 * Sentinel tenant ID for platform admins who operate outside any real tenant
 * scope. The max UUID value (all f's) is chosen because it cannot appear in
 * normal auto-generated UUID v4 data and is clearly synthetic.
 */
export const PLATFORM_ADMIN_TENANT_ID = 'ffffffff-ffff-ffff-ffff-ffffffffffff';

@Injectable()
export class TenantContextMiddleware implements NestMiddleware {
  use(req: Request, _res: Response, next: NextFunction): void {
    const tenantId = req.headers['x-tenant-id'] as string;
    const userId = req.headers['x-user-id'] as string;
    const isPlatformAdmin = req.headers['x-is-platform-admin'] === 'true';

    if (!tenantId && !isPlatformAdmin) {
      next();
      return;
    }

    const context: TenantContextData = {
      tenantId: tenantId || PLATFORM_ADMIN_TENANT_ID,
      userId: userId || '',
      isPlatformAdmin,
    };

    tenantStorage.run(context, () => next());
  }
}
