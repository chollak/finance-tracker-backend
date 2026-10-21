import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * FT-131: the spending audit and its goals. `audits` — one row per user and month: the candidates the rules found
 * with the person's decisions (JSON), the audit day and a write version. `goals` — one row per candidate turned into
 * a goal by «Готово»: the spending, the limit, the days it counts, a subscription's charge and its answer.
 */
export class AuditsGoals1762200000000 implements MigrationInterface {
  name = 'AuditsGoals1762200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE "audits" ("id" varchar PRIMARY KEY NOT NULL, "user_id" varchar NOT NULL, "month" varchar NOT NULL, "candidates" text NOT NULL, "done_on" date, "version" integer NOT NULL DEFAULT (0), "created_at" datetime NOT NULL DEFAULT (datetime('now')), "updated_at" datetime NOT NULL DEFAULT (datetime('now')))`);
    await queryRunner.query(`CREATE UNIQUE INDEX "IDX_audits_user_month" ON "audits" ("user_id", "month") `);
    await queryRunner.query(`CREATE TABLE "goals" ("id" varchar PRIMARY KEY NOT NULL, "user_id" varchar NOT NULL, "audit_id" varchar NOT NULL, "candidate_id" varchar NOT NULL, "kind" varchar NOT NULL, "name" varchar NOT NULL, "category_id" varchar NOT NULL, "note_key" varchar, "service_key" varchar, "monthly_minor" bigint NOT NULL, "limit_minor" bigint NOT NULL DEFAULT (0), "starts_on" date NOT NULL, "ends_on" date NOT NULL, "last_charge_on" date, "charge_months" integer, "subscription_state" varchar, "remind_on" date, "cancelled_on" date, "created_at" datetime NOT NULL DEFAULT (datetime('now')), "updated_at" datetime NOT NULL DEFAULT (datetime('now')))`);
    await queryRunner.query(`CREATE UNIQUE INDEX "IDX_goals_audit_candidate" ON "goals" ("audit_id", "candidate_id") `);
    await queryRunner.query(`CREATE INDEX "IDX_goals_user" ON "goals" ("user_id") `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_goals_user"`);
    await queryRunner.query(`DROP INDEX "IDX_goals_audit_candidate"`);
    await queryRunner.query(`DROP TABLE "goals"`);
    await queryRunner.query(`DROP INDEX "IDX_audits_user_month"`);
    await queryRunner.query(`DROP TABLE "audits"`);
  }
}
