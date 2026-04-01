import { QueryRunner } from 'typeorm';
import { tenantStorage } from './tenant-context.subscriber';

/**
 * Sets RLS session variables on a query runner.
 * Must be called within a transaction for SET LOCAL to apply correctly.
 */
export async function setRlsContext(queryRunner: QueryRunner): Promise<void> {
  const context = tenantStorage.getStore();
  if (!context) return;

  await queryRunner.query(
    `SET LOCAL app.current_tenant_id = $1`,
    [context.tenantId],
  );
  await queryRunner.query(
    `SET LOCAL app.is_platform_admin = $1`,
    [String(context.isPlatformAdmin)],
  );
}
