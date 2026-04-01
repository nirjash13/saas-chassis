import { AsyncLocalStorage } from 'async_hooks';

export interface TenantContextData {
  tenantId: string;
  userId: string;
  isPlatformAdmin: boolean;
}

export const tenantStorage = new AsyncLocalStorage<TenantContextData>();
