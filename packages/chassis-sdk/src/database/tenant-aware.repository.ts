import {
  DataSource,
  EntityTarget,
  FindManyOptions,
  FindOneOptions,
  ObjectLiteral,
  DeepPartial,
  QueryRunner,
} from 'typeorm';
import { tenantStorage } from './tenant-context.subscriber';

/**
 * Repository base class that wraps all queries in a transaction
 * with RLS tenant context (SET LOCAL).
 */
export class TenantAwareRepository<T extends ObjectLiteral> {
  constructor(
    private dataSource: DataSource,
    private entity: EntityTarget<T>,
  ) {}

  async findAll(options?: FindManyOptions<T>): Promise<T[]> {
    return this.withTenantContext(async (qr) => {
      return qr.manager.find(this.entity, options);
    });
  }

  async findOne(options: FindOneOptions<T>): Promise<T | null> {
    return this.withTenantContext(async (qr) => {
      return qr.manager.findOne(this.entity, options);
    });
  }

  async save(entity: DeepPartial<T>): Promise<T> {
    return this.withTenantContext(async (qr) => {
      return qr.manager.save(this.entity, entity);
    });
  }

  async remove(entity: T): Promise<T> {
    return this.withTenantContext(async (qr) => {
      return qr.manager.remove(entity);
    });
  }

  async count(options?: FindManyOptions<T>): Promise<number> {
    return this.withTenantContext(async (qr) => {
      return qr.manager.count(this.entity, options);
    });
  }

  protected async withTenantContext<R>(
    fn: (qr: QueryRunner) => Promise<R>,
  ): Promise<R> {
    const context = tenantStorage.getStore();
    const queryRunner = this.dataSource.createQueryRunner();

    try {
      await queryRunner.connect();
      await queryRunner.startTransaction();

      if (context) {
        await queryRunner.query(`SET LOCAL app.current_tenant_id = $1`, [
          context.tenantId,
        ]);
        await queryRunner.query(`SET LOCAL app.is_platform_admin = $1`, [
          String(context.isPlatformAdmin),
        ]);
      }

      const result = await fn(queryRunner);
      await queryRunner.commitTransaction();
      return result;
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }
  }
}
