import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntitySubscriberInterface, QueryRunner } from 'typeorm';
import { tenantStorage } from './tenant-storage';

@Injectable()
export class RlsSubscriber implements EntitySubscriberInterface {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {
    dataSource.subscribers.push(this);
  }

  async beforeQuery(event: { queryRunner?: QueryRunner }): Promise<void> {
    const store = tenantStorage.getStore();
    if (!store?.tenantId || !event.queryRunner) return;
    await event.queryRunner.query('SELECT set_config($1, $2, true)', [
      'app.current_tenant_id',
      store.tenantId,
    ]);
    await event.queryRunner.query('SELECT set_config($1, $2, true)', [
      'app.is_platform_admin',
      String(store.isPlatformAdmin),
    ]);
  }
}
