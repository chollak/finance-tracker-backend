import { randomUUID } from 'crypto';
import { MigrationInterface, QueryRunner } from 'typeorm';
import { createLogger, LogCategory } from '../../logging';

const logger = createLogger(LogCategory.DATABASE);

/**
 * FT-101: accounts. Every user — from `users` and from `transactions.userId` — gets the account
 * «Карта» (card, UZS) and all their history moves onto it. Its opening balance is 0 on the day of the
 * migration; the first launch (FT-109) sets the real balances. Records before the opening date stay in
 * history and analytics but are not counted in the balance.
 */
const COLUMNS = [
  'id', 'amount_minor', 'type', 'semanticType', 'needsReview', 'description', 'date', 'merchant', 'confidence',
  'originalText', 'originalParsing', 'tags', 'createdAt', 'updatedAt', 'userId', 'isArchived', 'isDebtRelated',
  'relatedDebtId', 'splitGroupId', 'category_id', 'legacy_category',
];
const quoted = (alias: string) => COLUMNS.map(column => `${alias}"${column}"`).join(', ');
const BASE = `"id" varchar PRIMARY KEY NOT NULL, "amount_minor" bigint NOT NULL, "type" varchar NOT NULL, "semanticType" varchar NOT NULL DEFAULT ('expense'), "needsReview" boolean NOT NULL DEFAULT (0), "description" varchar NOT NULL, "date" date NOT NULL, "merchant" varchar, "confidence" decimal(3,2), "originalText" text, "originalParsing" text, "tags" varchar, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "userId" varchar NOT NULL, "isArchived" boolean NOT NULL DEFAULT (0), "isDebtRelated" boolean NOT NULL DEFAULT (0), "relatedDebtId" varchar, "splitGroupId" varchar, "category_id" varchar NOT NULL, "legacy_category" varchar`;

/** The calendar day in Tashkent, where every user is for now. */
function todayInTashkent(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tashkent', year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(new Date());
}

export class Accounts1761000000000 implements MigrationInterface {
  name = 'Accounts1761000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE "accounts" ("id" varchar PRIMARY KEY NOT NULL, "user_id" varchar NOT NULL, "name" varchar(40) NOT NULL, "kind" varchar NOT NULL, "currency" varchar NOT NULL, "opening_balance_minor" bigint NOT NULL DEFAULT (0), "opening_date" date NOT NULL, "is_hidden" boolean NOT NULL DEFAULT (0), "sort_order" integer NOT NULL DEFAULT (0), "created_at" datetime NOT NULL DEFAULT (datetime('now')), "updated_at" datetime NOT NULL DEFAULT (datetime('now')))`);
    await queryRunner.query(`CREATE INDEX "IDX_accounts_user" ON "accounts" ("user_id") `);

    const users: Array<{ id: string }> = await queryRunner.query(
      `SELECT "id" FROM "users" UNION SELECT DISTINCT "userId" AS "id" FROM "transactions"`
    );
    const openingDate = todayInTashkent();
    await queryRunner.query(`CREATE TABLE "ft101_account_map" ("user_id" varchar PRIMARY KEY NOT NULL, "account_id" varchar NOT NULL)`);
    for (const { id: userId } of users) {
      const accountId = randomUUID();
      await queryRunner.query(
        `INSERT INTO "accounts" ("id", "user_id", "name", "kind", "currency", "opening_balance_minor", "opening_date", "sort_order") VALUES (?, ?, 'Карта', 'card', 'UZS', 0, ?, 10)`,
        [accountId, userId, openingDate]
      );
      await queryRunner.query(`INSERT INTO "ft101_account_map" ("user_id", "account_id") VALUES (?, ?)`, [userId, accountId]);
    }

    await queryRunner.query(`CREATE TABLE "temporary_transactions" (${BASE}, "account_id" varchar NOT NULL)`);
    await queryRunner.query(
      `INSERT INTO "temporary_transactions"(${quoted('')}, "account_id") ` +
      `SELECT ${quoted('t.')}, m."account_id" FROM "transactions" t JOIN "ft101_account_map" m ON m."user_id" = t."userId"`
    );

    const [{ before }] = await queryRunner.query(`SELECT COUNT(*) AS "before" FROM "transactions"`);
    const [{ after }] = await queryRunner.query(`SELECT COUNT(*) AS "after" FROM "temporary_transactions"`);
    if (Number(before) !== Number(after)) {
      throw new Error(`FT-101: ${before} records before moving onto accounts, ${after} after; nothing was changed.`);
    }

    await queryRunner.query(`DROP TABLE "ft101_account_map"`);
    await queryRunner.query(`DROP TABLE "transactions"`);
    await queryRunner.query(`ALTER TABLE "temporary_transactions" RENAME TO "transactions"`);
    await queryRunner.query(`CREATE INDEX "IDX_transactions_user_date" ON "transactions" ("userId", "date") `);
    await queryRunner.query(`CREATE INDEX "IDX_transactions_account" ON "transactions" ("account_id") `);

    if (users.length > 0) {
      logger.info('FT-101: history moved onto the account «Карта»', { users: users.length, records: Number(after), openingDate });
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_transactions_account"`);
    await queryRunner.query(`DROP INDEX "IDX_transactions_user_date"`);
    await queryRunner.query(`CREATE TABLE "temporary_transactions" (${BASE})`);
    await queryRunner.query(`INSERT INTO "temporary_transactions"(${quoted('')}) SELECT ${quoted('')} FROM "transactions"`);
    await queryRunner.query(`DROP TABLE "transactions"`);
    await queryRunner.query(`ALTER TABLE "temporary_transactions" RENAME TO "transactions"`);
    await queryRunner.query(`DROP INDEX "IDX_accounts_user"`);
    await queryRunner.query(`DROP TABLE "accounts"`);
  }
}
