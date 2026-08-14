#!/usr/bin/env node
/*
 * End-to-end check that the semantic chain holds on a running app.
 *
 * Unit tests prove each piece in isolation; this proves they agree with each
 * other on live data — the dashboard, the category breakdown and the stored
 * rows all describing the same money the same way.
 *
 * Expects the fixture from `npm run seed:test -- --reset`, whose totals are
 * fixed precisely so they can be asserted.
 *
 * Usage:
 *   npm run dev                          # in another terminal
 *   npm run seed:test -- --reset
 *   npm run smoke:semantics
 *   npm run smoke:semantics -- --parse   # also exercise text parsing (costs OpenAI calls)
 */

const BASE = process.env.SMOKE_BASE_URL || 'http://127.0.0.1:3000';
const USER = process.env.SMOKE_TELEGRAM_ID || '131184740';

const NON_EXPENSE_TYPES = ['own_transfer', 'saving_deposit', 'cash_withdrawal', 'debt', 'group_payment', 'reimbursement'];

/** Must match the fixture in seed-test-data.ts. */
const EXPECTED = { realExpense: 2_532_000, income: 12_000_000, awaitingReview: 2, nonExpenseMovements: 6 };

let failures = 0;

function check(name: string, actual: unknown, expected: unknown) {
  const ok = actual === expected;
  if (!ok) failures += 1;
  const mark = ok ? 'OK  ' : 'ПЛОХО';
  console.log(`  ${mark} ${name.padEnd(38)} ${String(actual).padStart(12)}   ждали ${expected}`);
}

async function get(path: string) {
  const response = await fetch(`${BASE}/api${path}`, { headers: { 'x-dev-user-id': USER } });
  if (!response.ok) throw new Error(`GET ${path} → ${response.status}`);
  return response.json();
}

async function parseText(text: string) {
  const response = await fetch(`${BASE}/api/voice/text-input`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-dev-user-id': USER },
    body: JSON.stringify({ text, userId: USER, userName: 'Smoke' }),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(`${text} → ${response.status}: ${JSON.stringify(body).slice(0, 120)}`);
  return body?.data?.transactions?.[0];
}

async function main() {
  const withParsing = process.argv.includes('--parse');

  console.log('Итоги на фикстуре:');
  const summary = (await get(`/dashboard/${USER}?startDate=2026-08-01&endDate=2026-09-01`)).data.insights.financialSummary;
  const categories = (await get(`/transactions/analytics/categories/${USER}`)).data ?? {};
  const categorySum = Object.values(categories).reduce((sum: number, entry: any) => sum + entry.amount, 0);
  const transactions = (await get(`/transactions/user/${USER}`)).data ?? [];

  check('реальные расходы', summary.totalExpense, EXPECTED.realExpense);
  check('доходы', summary.totalIncome, EXPECTED.income);
  check('сумма по категориям равна расходам', categorySum, summary.totalExpense);
  check('ждут решения', transactions.filter((t: any) => t.needsReview).length, EXPECTED.awaitingReview);
  check(
    'не-расходных движений',
    transactions.filter((t: any) => NON_EXPENSE_TYPES.includes(t.semanticType)).length,
    EXPECTED.nonExpenseMovements
  );

  console.log('\nБюджеты считают только реальные траты:');
  const budgets = (await get(`/budgets/users/${USER}/budgets/summaries`)).data ?? [];
  const budgetSpend = budgets.reduce((sum: number, b: any) => sum + b.spent, 0);
  check('сумма трат по бюджетам не больше расходов', budgetSpend <= summary.totalExpense, true);

  if (withParsing) {
    console.log('\nРазбор текста (обращается к OpenAI):');
    const cases: Array<[string, (tx: any) => boolean, string]> = [
      ['кофе 25000', (t) => t?.semanticType === 'expense' && t?.amount === 25_000, 'обычный расход'],
      ['зарплата 12 млн', (t) => t?.amount === 12_000_000, 'множитель не потерян'],
      ['перевел 500000 на Alif', (t) => t?.semanticType === 'own_transfer', 'перевод себе'],
      ['положил на вклад 1000000', (t) => t?.semanticType === 'saving_deposit', 'вклад'],
      ['снял в банкомате 300000', (t) => t?.semanticType === 'cash_withdrawal', 'снятие наличных'],
    ];

    for (const [text, predicate, label] of cases) {
      try {
        const tx = await parseText(text);
        const ok = predicate(tx);
        if (!ok) failures += 1;
        console.log(`  ${ok ? 'OK  ' : 'ПЛОХО'} ${label.padEnd(24)} «${text}» → ${tx?.semanticType} ${tx?.amount}`);
      } catch (error) {
        failures += 1;
        console.log(`  ПЛОХО ${label.padEnd(24)} ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    console.log('\n  Внимание: разбор создал транзакции — перед следующим прогоном пересей фикстуру.');
  }

  console.log(failures === 0 ? '\nВсё сходится.' : `\nРасхождений: ${failures}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(`\nОшибка: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
