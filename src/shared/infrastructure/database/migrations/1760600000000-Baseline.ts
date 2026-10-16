import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Schema as it stood when the project moved from `synchronize` to migrations (FT-090).
 *
 * Databases created earlier by `synchronize` already have these tables, so every statement is
 * `IF NOT EXISTS`: on such a database the migration only records itself. A fresh database gets the
 * full schema. The SQL is exactly what TypeORM `synchronize` produced for the entities at that point;
 * `findSchemaDrift()` checks after every start that entities and tables still agree.
 */
const BASELINE_TABLES = [
  `CREATE TABLE IF NOT EXISTS "budgets" ("id" varchar PRIMARY KEY NOT NULL, "name" varchar NOT NULL, "amount" decimal(10,2) NOT NULL, "period" varchar NOT NULL DEFAULT ('monthly'), "startDate" date NOT NULL, "endDate" date NOT NULL, "categoryIds" text, "isActive" boolean NOT NULL DEFAULT (1), "spent" decimal(10,2) NOT NULL DEFAULT (0), "description" varchar, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "userId" varchar NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS "debts" ("id" varchar PRIMARY KEY NOT NULL, "userId" varchar NOT NULL, "type" varchar NOT NULL DEFAULT ('i_owe'), "personName" varchar NOT NULL, "originalAmount" decimal(12,2) NOT NULL, "remainingAmount" decimal(12,2) NOT NULL, "currency" varchar NOT NULL DEFAULT ('UZS'), "description" varchar, "status" varchar NOT NULL DEFAULT ('active'), "dueDate" date, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "relatedTransactionId" varchar, "splitGroupId" varchar, "splitExpenseId" varchar)`,
  `CREATE TABLE IF NOT EXISTS "debt_payments" ("id" varchar PRIMARY KEY NOT NULL, "debtId" varchar NOT NULL, "amount" decimal(12,2) NOT NULL, "note" varchar, "paidAt" datetime NOT NULL, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "FK_d2a2d5006c00bb3998be54ec542" FOREIGN KEY ("debtId") REFERENCES "debts" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)`,
  `CREATE TABLE IF NOT EXISTS "subscriptions" ("id" varchar PRIMARY KEY NOT NULL, "user_id" varchar NOT NULL, "tier" varchar NOT NULL DEFAULT ('free'), "source" varchar NOT NULL DEFAULT ('payment'), "status" varchar NOT NULL DEFAULT ('active'), "price_stars" integer NOT NULL DEFAULT (100), "currency" varchar NOT NULL DEFAULT ('XTR'), "start_date" datetime NOT NULL, "end_date" datetime, "trial_ends_at" datetime, "telegram_payment_charge_id" varchar, "provider_payment_charge_id" varchar, "auto_renew" boolean NOT NULL DEFAULT (1), "granted_by" varchar, "grant_note" varchar, "created_at" datetime NOT NULL DEFAULT (datetime('now')), "updated_at" datetime NOT NULL DEFAULT (datetime('now')), "cancelled_at" datetime, "cancellation_reason" varchar)`,
  `CREATE TABLE IF NOT EXISTS "transactions" ("id" varchar PRIMARY KEY NOT NULL, "amount" decimal(10,2) NOT NULL, "type" varchar NOT NULL, "semanticType" varchar NOT NULL DEFAULT ('expense'), "needsReview" boolean NOT NULL DEFAULT (0), "description" varchar NOT NULL, "date" date NOT NULL, "merchant" varchar, "confidence" decimal(3,2), "originalText" text, "originalParsing" text, "tags" varchar, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "userId" varchar NOT NULL, "category" varchar DEFAULT ('Другое'), "isArchived" boolean NOT NULL DEFAULT (0), "isDebtRelated" boolean NOT NULL DEFAULT (0), "relatedDebtId" varchar, "splitGroupId" varchar)`,
  `CREATE TABLE IF NOT EXISTS "usage_limits" ("id" varchar PRIMARY KEY NOT NULL, "user_id" varchar NOT NULL, "period_start" datetime NOT NULL, "period_end" datetime NOT NULL, "transactions_count" integer NOT NULL DEFAULT (0), "voice_inputs_count" integer NOT NULL DEFAULT (0), "active_debts_count" integer NOT NULL DEFAULT (0), "created_at" datetime NOT NULL DEFAULT (datetime('now')), "updated_at" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "UQ_8b7f2b48b7a2ccc13cb6b599d13" UNIQUE ("user_id"))`,
  `CREATE TABLE IF NOT EXISTS "users" ("id" varchar PRIMARY KEY NOT NULL, "telegram_id" varchar NOT NULL, "user_name" varchar, "first_name" varchar, "last_name" varchar, "language_code" varchar NOT NULL DEFAULT ('ru'), "default_currency" varchar NOT NULL DEFAULT ('UZS'), "timezone" varchar NOT NULL DEFAULT ('Asia/Tashkent'), "created_at" datetime NOT NULL DEFAULT (datetime('now')), "updated_at" datetime NOT NULL DEFAULT (datetime('now')), "last_seen_at" datetime, CONSTRAINT "UQ_1a1e4649fd31ea6ec6b025c7bfc" UNIQUE ("telegram_id"))`,
];

export class Baseline1760600000000 implements MigrationInterface {
  name = 'Baseline1760600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const sql of BASELINE_TABLES) {
      await queryRunner.query(sql);
    }
  }

  public async down(): Promise<void> {
    // These tables hold the data that existed before migrations; reverting would delete it.
    throw new Error('The baseline migration cannot be reverted: it would drop all existing data.');
  }
}
