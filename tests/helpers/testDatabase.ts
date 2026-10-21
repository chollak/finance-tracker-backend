import 'reflect-metadata';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { DataSource } from 'typeorm';
import { createAppDataSource } from '../../src/shared/infrastructure/database/database.config';
import { runMigrationsWithBackup } from '../../src/shared/infrastructure/database/migrationRunner';

export interface TestDatabase {
  dataSource: DataSource;
  close(): Promise<void>;
}

/** A fresh SQLite file in a temp directory with every migration applied. */
export async function openMigratedDatabase(): Promise<TestDatabase> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ft-db-'));
  const file = path.join(dir, 'db.sqlite');
  const dataSource = createAppDataSource(file);
  await dataSource.initialize();
  await runMigrationsWithBackup(dataSource, file, path.join(dir, 'backups'));
  return {
    dataSource,
    async close() {
      if (dataSource.isInitialized) await dataSource.destroy();
      fs.rmSync(dir, { recursive: true, force: true });
    },
  };
}
