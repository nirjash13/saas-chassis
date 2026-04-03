import { DataSource, QueryRunner, ObjectLiteral } from 'typeorm';
import { TenantAwareRepository } from './tenant-aware.repository';
import { tenantStorage, TenantContextData } from './tenant-context.subscriber';

// Minimal concrete entity for testing
class StubEntity implements ObjectLiteral {
  id!: string;
}

function makeQueryRunner(overrides?: Partial<QueryRunner>): QueryRunner {
  return {
    connect: jest.fn().mockResolvedValue(undefined),
    startTransaction: jest.fn().mockResolvedValue(undefined),
    query: jest.fn().mockResolvedValue(undefined),
    commitTransaction: jest.fn().mockResolvedValue(undefined),
    rollbackTransaction: jest.fn().mockResolvedValue(undefined),
    release: jest.fn().mockResolvedValue(undefined),
    manager: {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue(null),
      save: jest.fn().mockResolvedValue({}),
      remove: jest.fn().mockResolvedValue({}),
      count: jest.fn().mockResolvedValue(0),
    },
    ...overrides,
  } as unknown as QueryRunner;
}

function makeDataSource(qr: QueryRunner): DataSource {
  return {
    createQueryRunner: jest.fn().mockReturnValue(qr),
  } as unknown as DataSource;
}

describe('TenantAwareRepository', () => {
  describe('missing tenant context (SDK-2 fix)', () => {
    it('throws when no tenant context is in AsyncLocalStorage', async () => {
      // Ensure we are outside any tenantStorage.run() scope
      const qr = makeQueryRunner();
      const ds = makeDataSource(qr);
      const repo = new TenantAwareRepository<StubEntity>(ds, StubEntity);

      // tenantStorage.getStore() returns undefined outside a run() scope
      await expect(repo.findAll()).rejects.toThrow(
        'TenantAwareRepository: No tenant context found',
      );
    });

    it('does not silently proceed — query runner connect is never called on missing context', async () => {
      const qr = makeQueryRunner();
      const ds = makeDataSource(qr);
      const repo = new TenantAwareRepository<StubEntity>(ds, StubEntity);

      try {
        await repo.findAll();
      } catch {
        // expected
      }

      expect(qr.connect).not.toHaveBeenCalled();
    });
  });

  describe('present tenant context', () => {
    const TENANT_CONTEXT: TenantContextData = {
      tenantId: 'tenant-uuid-123',
      userId: 'user-uuid-456',
      isPlatformAdmin: false,
    };

    function runWithContext<T>(fn: () => Promise<T>): Promise<T> {
      return tenantStorage.run(TENANT_CONTEXT, fn);
    }

    it('executes SET LOCAL app.current_tenant_id before the query', async () => {
      const qr = makeQueryRunner();
      const ds = makeDataSource(qr);
      const repo = new TenantAwareRepository<StubEntity>(ds, StubEntity);

      await runWithContext(() => repo.findAll());

      expect(qr.query).toHaveBeenCalledWith(
        'SET LOCAL app.current_tenant_id = $1',
        ['tenant-uuid-123'],
      );
    });

    it('executes SET LOCAL app.is_platform_admin before the query', async () => {
      const qr = makeQueryRunner();
      const ds = makeDataSource(qr);
      const repo = new TenantAwareRepository<StubEntity>(ds, StubEntity);

      await runWithContext(() => repo.findAll());

      expect(qr.query).toHaveBeenCalledWith(
        'SET LOCAL app.is_platform_admin = $1',
        ['false'],
      );
    });

    it('executes SET LOCAL calls before the entity query', async () => {
      const callOrder: string[] = [];
      const qr = makeQueryRunner({
        query: jest.fn().mockImplementation((sql: string) => {
          callOrder.push(sql.includes('current_tenant_id') ? 'set-tenant' : 'set-admin');
          return Promise.resolve(undefined);
        }),
        manager: {
          find: jest.fn().mockImplementation(() => {
            callOrder.push('find');
            return Promise.resolve([]);
          }),
        } as unknown as QueryRunner['manager'],
      });
      const ds = makeDataSource(qr);
      const repo = new TenantAwareRepository<StubEntity>(ds, StubEntity);

      await runWithContext(() => repo.findAll());

      const findIndex = callOrder.indexOf('find');
      const setTenantIndex = callOrder.indexOf('set-tenant');
      const setAdminIndex = callOrder.indexOf('set-admin');

      expect(setTenantIndex).toBeLessThan(findIndex);
      expect(setAdminIndex).toBeLessThan(findIndex);
    });

    it('commits the transaction on success', async () => {
      const qr = makeQueryRunner();
      const ds = makeDataSource(qr);
      const repo = new TenantAwareRepository<StubEntity>(ds, StubEntity);

      await runWithContext(() => repo.findAll());

      expect(qr.commitTransaction).toHaveBeenCalledTimes(1);
      expect(qr.rollbackTransaction).not.toHaveBeenCalled();
    });

    it('rolls back and rethrows on query error', async () => {
      const qr = makeQueryRunner({
        manager: {
          find: jest.fn().mockRejectedValue(new Error('DB error')),
        } as unknown as QueryRunner['manager'],
      });
      const ds = makeDataSource(qr);
      const repo = new TenantAwareRepository<StubEntity>(ds, StubEntity);

      await expect(runWithContext(() => repo.findAll())).rejects.toThrow('DB error');

      expect(qr.rollbackTransaction).toHaveBeenCalledTimes(1);
      expect(qr.commitTransaction).not.toHaveBeenCalled();
    });

    it('always releases the query runner (finally block)', async () => {
      const qr = makeQueryRunner({
        manager: {
          find: jest.fn().mockRejectedValue(new Error('DB error')),
        } as unknown as QueryRunner['manager'],
      });
      const ds = makeDataSource(qr);
      const repo = new TenantAwareRepository<StubEntity>(ds, StubEntity);

      try {
        await runWithContext(() => repo.findAll());
      } catch {
        // expected
      }

      expect(qr.release).toHaveBeenCalledTimes(1);
    });

    it('passes SET LOCAL strings for isPlatformAdmin = true', async () => {
      const adminContext: TenantContextData = {
        tenantId: '00000000-0000-0000-0000-000000000000',
        userId: 'admin-user',
        isPlatformAdmin: true,
      };

      const qr = makeQueryRunner();
      const ds = makeDataSource(qr);
      const repo = new TenantAwareRepository<StubEntity>(ds, StubEntity);

      await tenantStorage.run(adminContext, () => repo.findAll());

      expect(qr.query).toHaveBeenCalledWith(
        'SET LOCAL app.is_platform_admin = $1',
        ['true'],
      );
    });
  });
});
