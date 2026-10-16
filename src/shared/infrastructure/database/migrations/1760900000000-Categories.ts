import { randomUUID } from 'crypto';
import { MigrationInterface, QueryRunner } from 'typeorm';
import { CATEGORY_PRESETS, presetForLegacyCategory } from '../../../../modules/category/domain/categoryPresets';
import { categoryNameKey } from '../../../../modules/category/domain/category';
import { createLogger, LogCategory } from '../../logging';

const logger = createLogger(LogCategory.DATABASE);

/**
 * FT-099: categories move from a static list of 26 + 7 ids into a `categories` table, 8 + 8 per user
 * (decision Д5). Every user — from `users` and from `transactions.userId` — gets the starter
 * categories; every record gets `category_id` by the table in docs/pastel/money-model.md, taking the
 * record's type into account. The old string stays in `legacy_category` until FT-136.
 * The report «old value → new category: count» is written to the log.
 */
const COLUMNS = [
  'id', 'amount_minor', 'type', 'semanticType', 'needsReview', 'description', 'date', 'merchant', 'confidence',
  'originalText', 'originalParsing', 'tags', 'createdAt', 'updatedAt', 'userId', 'isArchived', 'isDebtRelated',
  'relatedDebtId', 'splitGroupId',
];
const quoted = (alias: string) => COLUMNS.map(column => `${alias}"${column}"`).join(', ');
const BASE = `"id" varchar PRIMARY KEY NOT NULL, "amount_minor" bigint NOT NULL, "type" varchar NOT NULL, "semanticType" varchar NOT NULL DEFAULT ('expense'), "needsReview" boolean NOT NULL DEFAULT (0), "description" varchar NOT NULL, "date" date NOT NULL, "merchant" varchar, "confidence" decimal(3,2), "originalText" text, "originalParsing" text, "tags" varchar, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "userId" varchar NOT NULL, "isArchived" boolean NOT NULL DEFAULT (0), "isDebtRelated" boolean NOT NULL DEFAULT (0), "relatedDebtId" varchar, "splitGroupId" varchar`;

export interface CategoryMoveReportRow {
  type: string;
  legacy: string;
  category: string;
  count: number;
}

export class Categories1760900000000 implements MigrationInterface {
  name = 'Categories1760900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE "categories" ("id" varchar PRIMARY KEY NOT NULL, "user_id" varchar NOT NULL, "type" varchar NOT NULL, "name" varchar(40) NOT NULL, "name_key" varchar NOT NULL, "color" varchar NOT NULL, "is_hidden" boolean NOT NULL DEFAULT (0), "is_other" boolean NOT NULL DEFAULT (0), "sort_order" integer NOT NULL DEFAULT (0), "preset_key" varchar, "created_at" datetime NOT NULL DEFAULT (datetime('now')), "updated_at" datetime NOT NULL DEFAULT (datetime('now')))`);
    await queryRunner.query(`CREATE UNIQUE INDEX "IDX_categories_user_type_preset" ON "categories" ("user_id", "type", "preset_key") `);
    await queryRunner.query(`CREATE UNIQUE INDEX "IDX_categories_user_type_name" ON "categories" ("user_id", "type", "name_key") `);

    // Starter categories for every known user
    const users: Array<{ id: string }> = await queryRunner.query(
      `SELECT "id" FROM "users" UNION SELECT DISTINCT "userId" AS "id" FROM "transactions"`
    );
    const categoryIds = new Map<string, string>(); // `${userId}|${type}|${presetKey}` → category id
    for (const { id: userId } of users) {
      for (const preset of CATEGORY_PRESETS) {
        const id = randomUUID();
        categoryIds.set(`${userId}|${preset.type}|${preset.key}`, id);
        await queryRunner.query(
          `INSERT INTO "categories" ("id", "user_id", "type", "name", "name_key", "color", "is_other", "sort_order", "preset_key") VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [id, userId, preset.type, preset.name, categoryNameKey(preset.name), preset.color, preset.isOther ? 1 : 0, preset.sortOrder, preset.key]
        );
      }
    }

    // Old value + record type → the user's new category, one row per distinct combination
    const groups: Array<{ userId: string; type: string; legacy: string; count: number }> = await queryRunner.query(
      `SELECT "userId", "type", COALESCE("category", '') AS "legacy", COUNT(*) AS "count" FROM "transactions" GROUP BY 1, 2, 3`
    );
    await queryRunner.query(`CREATE TABLE "ft099_category_map" ("user_id" varchar NOT NULL, "type" varchar NOT NULL, "legacy" varchar NOT NULL, "category_id" varchar NOT NULL)`);
    const report = new Map<string, CategoryMoveReportRow>();
    for (const group of groups) {
      const type = group.type === 'income' ? 'income' : 'expense';
      const preset = presetForLegacyCategory(group.legacy, type);
      const categoryId = categoryIds.get(`${group.userId}|${type}|${preset.key}`)!;
      await queryRunner.query(
        `INSERT INTO "ft099_category_map" ("user_id", "type", "legacy", "category_id") VALUES (?, ?, ?, ?)`,
        [group.userId, group.type, group.legacy, categoryId]
      );
      const key = `${type}|${group.legacy}|${preset.name}`;
      const row = report.get(key) ?? { type, legacy: group.legacy || '(пусто)', category: preset.name, count: 0 };
      row.count += Number(group.count);
      report.set(key, row);
    }

    await queryRunner.query(`CREATE TABLE "temporary_transactions" (${BASE}, "category_id" varchar NOT NULL, "legacy_category" varchar)`);
    await queryRunner.query(
      `INSERT INTO "temporary_transactions"(${quoted('')}, "category_id", "legacy_category") ` +
      `SELECT ${quoted('t.')}, m."category_id", t."category" FROM "transactions" t ` +
      `JOIN "ft099_category_map" m ON m."user_id" = t."userId" AND m."type" = t."type" AND m."legacy" = COALESCE(t."category", '')`
    );

    const [{ before }] = await queryRunner.query(`SELECT COUNT(*) AS "before" FROM "transactions"`);
    const [{ after }] = await queryRunner.query(`SELECT COUNT(*) AS "after" FROM "temporary_transactions"`);
    if (Number(before) !== Number(after)) {
      throw new Error(`FT-099: ${before} records before moving categories, ${after} after; nothing was changed.`);
    }

    await queryRunner.query(`DROP TABLE "ft099_category_map"`);
    await queryRunner.query(`DROP TABLE "transactions"`);
    await queryRunner.query(`ALTER TABLE "temporary_transactions" RENAME TO "transactions"`);

    const rows = [...report.values()].sort((a, b) => a.type.localeCompare(b.type) || b.count - a.count);
    if (rows.length > 0) {
      logger.info('FT-099: records moved to the new categories', {
        users: users.length,
        report: rows.map(row => `${row.type}: ${row.legacy} → ${row.category} (${row.count})`).join('; '),
      });
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE "temporary_transactions" (${BASE}, "category" varchar DEFAULT ('Другое'))`);
    await queryRunner.query(
      `INSERT INTO "temporary_transactions"(${quoted('')}, "category") ` +
      `SELECT ${quoted('t.')}, COALESCE(t."legacy_category", c."name") FROM "transactions" t ` +
      `LEFT JOIN "categories" c ON c."id" = t."category_id"`
    );
    await queryRunner.query(`DROP TABLE "transactions"`);
    await queryRunner.query(`ALTER TABLE "temporary_transactions" RENAME TO "transactions"`);
    await queryRunner.query(`DROP INDEX "IDX_categories_user_type_name"`);
    await queryRunner.query(`DROP INDEX "IDX_categories_user_type_preset"`);
    await queryRunner.query(`DROP TABLE "categories"`);
  }
}
