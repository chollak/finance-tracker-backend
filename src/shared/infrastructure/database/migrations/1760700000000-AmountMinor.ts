import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * FT-097: `transactions.amount decimal(10,2)` → `amount_minor bigint` (integer minor units, ×100).
 *
 * SQLite cannot change a column type in place, so the table is rebuilt the way TypeORM does it. Every
 * row is then checked against the formula `amount_minor = round(amount × 100)` and per-user totals are
 * compared; any difference aborts the migration (it runs in a transaction, and the app copied the
 * database to data/backups/ before it started).
 */
const COLUMNS_AFTER_AMOUNT = [
  'type', 'semanticType', 'needsReview', 'description', 'date', 'merchant', 'confidence', 'originalText',
  'originalParsing', 'tags', 'createdAt', 'updatedAt', 'userId', 'category', 'isArchived', 'isDebtRelated',
  'relatedDebtId', 'splitGroupId',
];
const REST = COLUMNS_AFTER_AMOUNT.map(column => `"${column}"`).join(', ');
const TAIL = `"type" varchar NOT NULL, "semanticType" varchar NOT NULL DEFAULT ('expense'), "needsReview" boolean NOT NULL DEFAULT (0), "description" varchar NOT NULL, "date" date NOT NULL, "merchant" varchar, "confidence" decimal(3,2), "originalText" text, "originalParsing" text, "tags" varchar, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "userId" varchar NOT NULL, "category" varchar DEFAULT ('Другое'), "isArchived" boolean NOT NULL DEFAULT (0), "isDebtRelated" boolean NOT NULL DEFAULT (0), "relatedDebtId" varchar, "splitGroupId" varchar`;

interface OldRow { id: string; userId: string; amount: number | string | null; kind: string }
interface NewRow { id: string; amount_minor: number }

export class AmountMinor1760700000000 implements MigrationInterface {
  name = 'AmountMinor1760700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const before: OldRow[] = await queryRunner.query(
      `SELECT "id", "userId", "amount", typeof("amount") AS "kind" FROM "transactions"`
    );
    const invalid = before.filter(row => row.kind !== 'integer' && row.kind !== 'real');
    if (invalid.length > 0) {
      throw new Error(
        `FT-097: ${invalid.length} transaction(s) have no numeric amount, so they cannot be converted: ` +
        `${invalid.slice(0, 10).map(row => `${row.id}=${String(row.amount)}`).join(', ')}. Fix them and start again.`
      );
    }

    await queryRunner.query(`CREATE TABLE "temporary_transactions" ("id" varchar PRIMARY KEY NOT NULL, "amount_minor" bigint NOT NULL, ${TAIL})`);
    await queryRunner.query(
      `INSERT INTO "temporary_transactions"("id", "amount_minor", ${REST}) ` +
      `SELECT "id", CAST(ROUND("amount" * 100) AS INTEGER), ${REST} FROM "transactions"`
    );

    const after: NewRow[] = await queryRunner.query(`SELECT "id", "amount_minor" FROM "temporary_transactions"`);
    verifyConversion(before, after);

    await queryRunner.query(`DROP TABLE "transactions"`);
    await queryRunner.query(`ALTER TABLE "temporary_transactions" RENAME TO "transactions"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE "temporary_transactions" ("id" varchar PRIMARY KEY NOT NULL, "amount" decimal(10,2) NOT NULL, ${TAIL})`);
    await queryRunner.query(
      `INSERT INTO "temporary_transactions"("id", "amount", ${REST}) ` +
      `SELECT "id", "amount_minor" / 100.0, ${REST} FROM "transactions"`
    );
    await queryRunner.query(`DROP TABLE "transactions"`);
    await queryRunner.query(`ALTER TABLE "temporary_transactions" RENAME TO "transactions"`);
  }
}

/**
 * Row by row: amount_minor = round(amount × 100); then, per user, the converted total equals the sum of
 * the expected rows, and lies within half a tiyin per row of the old total — amounts with more than two
 * decimals (33333.333) round row by row, so the totals may differ by that much and no more. Throws on
 * any other difference.
 */
export function verifyConversion(before: OldRow[], after: NewRow[]): void {
  const converted = new Map(after.map(row => [row.id, Number(row.amount_minor)]));
  if (converted.size !== before.length) {
    throw new Error(`FT-097: ${before.length} rows before the conversion, ${converted.size} after.`);
  }

  const mismatched: string[] = [];
  const users = new Map<string, { before: number; expected: number; after: number; rows: number }>();
  for (const row of before) {
    const amount = Number(row.amount);
    const expected = Math.round(amount * 100);
    const actual = converted.get(row.id);
    if (actual !== expected) mismatched.push(`${row.id}: ${amount} → ${String(actual)}`);
    const totals = users.get(row.userId) ?? { before: 0, expected: 0, after: 0, rows: 0 };
    totals.before += amount;
    totals.expected += expected;
    totals.after += actual ?? 0;
    totals.rows += 1;
    users.set(row.userId, totals);
  }
  if (mismatched.length > 0) {
    throw new Error(`FT-097: ${mismatched.length} amount(s) did not convert exactly: ${mismatched.slice(0, 10).join('; ')}`);
  }
  for (const [userId, totals] of users) {
    const drift = Math.abs(totals.before * 100 - totals.after);
    if (totals.after !== totals.expected || drift > totals.rows * 0.5 + 1e-6 * Math.abs(totals.before * 100)) {
      throw new Error(`FT-097: totals differ for user ${userId}: ${totals.before} before, ${totals.after} minor after.`);
    }
  }
}
