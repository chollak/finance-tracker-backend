#!/usr/bin/env node
/*
 * Seeds a local dev database with a deterministic fixture.
 *
 * Goes through the running API rather than writing SQL directly. The previous
 * version spoke to the schema of January 2026 — `telegramId` against a column
 * now called `telegram_id`, a telegram id where a user UUID belongs, and no
 * semantic columns at all — so it failed on its first query. Through the API
 * it cannot drift from the schema, and everything it writes passes the same
 * validation a real user's input does.
 *
 * The fixture is deliberately fixed rather than random: it covers every
 * semantic type once, so the numbers it produces can be asserted.
 *
 * Usage:
 *   npm run dev                     # in another terminal
 *   npm run seed:test               # add the fixture
 *   npm run seed:test -- --reset    # remove this user's data first
 *   npm run seed:test -- --user=131184740 --base=http://127.0.0.1:3000
 */

const DEFAULT_BASE = process.env.SEED_BASE_URL || 'http://127.0.0.1:3000';
const DEFAULT_USER = process.env.SEED_TELEGRAM_ID || '131184740';

interface SeedTransaction {
  amount: number;
  type: 'income' | 'expense';
  semanticType: string;
  category: string;
  description: string;
  date: string;
  needsReview?: boolean;
}

/** One of every semantic type, with amounts that are easy to check by eye. */
const TRANSACTIONS: SeedTransaction[] = [
  { amount: 32_000, type: 'expense', semanticType: 'expense', category: 'coffee', description: 'Кофе и завтрак', date: '2026-08-11' },
  { amount: 145_000, type: 'expense', semanticType: 'expense', category: 'groceries', description: 'Продукты на неделю', date: '2026-08-10' },
  { amount: 25_000, type: 'expense', semanticType: 'expense', category: 'taxi', description: 'Яндекс такси', date: '2026-08-12' },
  { amount: 890_000, type: 'expense', semanticType: 'expense', category: 'utilities', description: 'Коммуналка за июль', date: '2026-08-05' },
  { amount: 240_000, type: 'expense', semanticType: 'expense', category: 'entertainment', description: 'Кино с друзьями', date: '2026-08-09' },
  { amount: 1_200_000, type: 'expense', semanticType: 'expense', category: 'shopping', description: 'Кроссовки', date: '2026-08-03' },

  { amount: 12_000_000, type: 'income', semanticType: 'income', category: 'salary', description: 'Зарплата за июль', date: '2026-08-05' },

  { amount: 3_000_000, type: 'expense', semanticType: 'own_transfer', category: 'transfer', description: 'Перевод с TBC на Alif', date: '2026-08-06' },
  { amount: 5_000_000, type: 'expense', semanticType: 'saving_deposit', category: 'transfer', description: 'Положил на вклад', date: '2026-08-05' },
  { amount: 1_000_000, type: 'expense', semanticType: 'cash_withdrawal', category: 'transfer', description: 'Снял наличные в банкомате', date: '2026-08-08' },
  { amount: 450_000, type: 'income', semanticType: 'reimbursement', category: 'taxi', description: 'Вернули за такси', date: '2026-08-11' },
  { amount: 2_000_000, type: 'expense', semanticType: 'debt', category: 'other', description: 'Одолжил Азизу', date: '2026-08-07' },

  { amount: 680_000, type: 'expense', semanticType: 'group_payment', category: 'restaurants', description: 'Оплатил счёт за всех', date: '2026-08-09', needsReview: true },
  { amount: 150_000, type: 'expense', semanticType: 'expense', category: 'other', description: 'Не помню что это', date: '2026-08-04', needsReview: true },
];

const BUDGETS = [
  { name: 'Еда', categoryIds: ['coffee', 'groceries', 'restaurants'], amount: 400_000, period: 'monthly' },
  { name: 'Транспорт', categoryIds: ['taxi'], amount: 150_000, period: 'monthly' },
  { name: 'Развлечения', categoryIds: ['entertainment'], amount: 500_000, period: 'monthly' },
];

const DEBTS = [
  { personName: 'Азиз', amount: 2_000_000, type: 'owed_to_me', description: 'Одолжил до зарплаты', date: '2026-07-28' },
  { personName: 'Джамшид', amount: 750_000, type: 'i_owe', description: 'Занял на ремонт', date: '2026-08-01' },
];

/**
 * Sums the fixture the way the product does, so a smoke run has something to
 * compare against without re-deriving the rule by hand.
 */
export const EXPECTED = {
  realExpense: TRANSACTIONS
    .filter((t) => t.semanticType === 'expense' && !t.needsReview)
    .reduce((sum, t) => sum + t.amount, 0),
  income: TRANSACTIONS
    .filter((t) => t.semanticType === 'income' && !t.needsReview)
    .reduce((sum, t) => sum + t.amount, 0),
  awaitingReview: TRANSACTIONS.filter((t) => t.needsReview).length,
};

function parseFlags(argv: string[]) {
  const flags: Record<string, string | boolean> = {};
  for (const token of argv) {
    if (!token.startsWith('--')) continue;
    const [key, value] = token.slice(2).split('=');
    flags[key] = value ?? true;
  }
  return flags;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Seeding is a burst of writes, which is exactly what the rate limiter exists
 * to stop. Backing off is honest here — the limit is doing its job, the script
 * just has to wait rather than die halfway through a fixture.
 */
async function call(
  base: string,
  user: string,
  method: string,
  path: string,
  body?: unknown,
  attempt = 1
): Promise<any> {
  const response = await fetch(`${base}/api${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', 'x-dev-user-id': user },
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await response.text();
  let parsed: any = null;
  try { parsed = JSON.parse(text); } catch { /* keep the raw body for the error */ }

  if (response.status === 429) {
    if (attempt > 3) {
      throw new Error(
        `${method} ${path} → упёрлись в лимит запросов и после трёх пауз он не отпустил. ` +
        'Перезапусти сервер: счётчик живёт в памяти процесса.'
      );
    }
    const waitMs = attempt * 20_000;
    console.log(`   лимит запросов исчерпан, пауза ${waitMs / 1000}с (попытка ${attempt}/3)`);
    await sleep(waitMs);
    return call(base, user, method, path, body, attempt + 1);
  }

  if (!response.ok) {
    throw new Error(`${method} ${path} → ${response.status}: ${text.slice(0, 200)}`);
  }
  return parsed;
}

async function reset(base: string, user: string) {
  const transactions = (await call(base, user, 'GET', `/transactions/user/${user}`))?.data ?? [];
  for (const transaction of transactions) {
    await call(base, user, 'DELETE', `/transactions/${transaction.id}`);
  }
  console.log(`   транзакций: ${transactions.length}`);

  const budgets = (await call(base, user, 'GET', `/budgets/users/${user}/budgets`))?.data ?? [];
  for (const budget of budgets) {
    await call(base, user, 'DELETE', `/budgets/${budget.id}`);
  }
  console.log(`   бюджетов: ${budgets.length}`);

  // Debts count against the free-tier limit, so leaving them behind makes a
  // second run fail with DEBT_LIMIT_EXCEEDED rather than reseeding cleanly.
  const debts = (await call(base, user, 'GET', `/debts/user/${user}`))?.data ?? [];
  for (const debt of debts) {
    await call(base, user, 'DELETE', `/debts/${debt.id}`);
  }
  console.log(`   долгов: ${debts.length}`);
}

async function main() {
  const flags = parseFlags(process.argv.slice(2));
  const base = String(flags.base ?? DEFAULT_BASE);
  const user = String(flags.user ?? DEFAULT_USER);

  console.log(`Сидер: ${base}, пользователь ${user}`);

  try {
    await call(base, user, 'GET', '/health');
  } catch {
    console.error(`\nСервер не отвечает на ${base}. Запусти его в другом терминале:\n  DATABASE_TYPE=sqlite ENABLE_TELEGRAM_POLLING=false npm run dev\n`);
    process.exit(1);
  }

  if (flags.reset) {
    console.log('\nОчистка:');
    await reset(base, user);
  }

  console.log('\nТранзакции:');
  for (const transaction of TRANSACTIONS) {
    await call(base, user, 'POST', '/transactions', { userId: user, ...transaction });
    const mark = transaction.needsReview ? ' (нужно проверить)' : '';
    console.log(`   ${transaction.description}${mark}`);
  }

  console.log('\nБюджеты:');
  for (const budget of BUDGETS) {
    await call(base, user, 'POST', `/budgets/users/${user}/budgets`, budget);
    console.log(`   ${budget.name}`);
  }

  console.log('\nДолги:');
  for (const debt of DEBTS) {
    await call(base, user, 'POST', `/debts/user/${user}`, debt);
    console.log(`   ${debt.personName}`);
  }

  console.log('\nОжидаемые итоги по этой фикстуре:');
  console.log(`   реальные расходы:   ${EXPECTED.realExpense.toLocaleString('ru-RU')}`);
  console.log(`   доходы:             ${EXPECTED.income.toLocaleString('ru-RU')}`);
  console.log(`   ждут решения:       ${EXPECTED.awaitingReview}`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`\nОшибка: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}
