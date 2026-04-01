import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import {
  tenantStorage,
  TenantContextData,
} from '../database/tenant-context.subscriber';

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
      tenantId: tenantId || '00000000-0000-0000-0000-000000000000',
      userId: userId || '',
      isPlatformAdmin,
    };

    tenantStorage.run(context, () => next());
  }
}
