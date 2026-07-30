# Semantic Transactions Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Add semantic transaction types so analytics, budgets, and weekly reviews count only real expenses as spending and separate own transfers, savings, debts, reimbursements, cash withdrawals, and group payments.

**Architecture:** Keep existing `type: 'income' | 'expense'` as the legacy cashflow direction for compatibility, and add a new `semanticType` field for meaning. Introduce a small domain helper that defines which semantic types count as real expense/income/budget spending, then migrate analytics/budgets/review logic to use that helper instead of raw `type === 'expense'`.

**Tech Stack:** Node.js 20, TypeScript, TypeORM SQLite entity, Supabase SQL migrations, Jest, React/Vite Mini App.

---

## Current Context

Benchmark file: `.hermes/plans/2026-07-29-finance-app-benchmark.md`.

Main benchmark conclusion:

> The product should compete on **capture + classification + trustworthy weekly review**, not on being a bank, superapp, or generic expense tracker.

Current transaction model only has:

```ts
type: 'income' | 'expense'
```

This is not enough because these all look like expenses today:

- transfer between own cards;
- deposit / savings top-up;
- debt repayment;
- lending money to someone;
- reimbursement received later;
- cash withdrawal;
- group payment / split expense.

## Target Domain Model

Add semantic type:

```ts
export const TRANSACTION_SEMANTIC_TYPES = [
  'expense',
  'income',
  'own_transfer',
  'saving_deposit',
  'debt',
  'reimbursement',
  'cash_withdrawal',
  'group_payment',
] as const;

export type TransactionSemanticType = typeof TRANSACTION_SEMANTIC_TYPES[number];
```

### Meaning

| semanticType | Legacy `type` default | Counts as real expense? | Counts in budgets? | Notes |
|---|---:|---:|---:|---|
| `expense` | `expense` | yes | yes | normal spending |
| `income` | `income` | no | no | salary, gifts, incoming money |
| `own_transfer` | `expense` or `income` | no | no | card-to-card, wallet/card movement |
| `saving_deposit` | `expense` | no | no | вклад/копилка/capital movement |
| `debt` | `expense` or `income` | no by default | no | loan given/received/paid; debt module handles relationship |
| `reimbursement` | `income` | no | no | return/refund/компенсация |
| `cash_withdrawal` | `expense` | no by default | no | cash movement, not final spend until cash is spent |
| `group_payment` | `expense` | maybe partial later | yes for payer share only later | MVP: exclude or mark needs review if split unknown |

### MVP rule

For P0, only `semanticType === 'expense'` counts as real spending. This is conservative and prevents false expense totals.

---

## Task 1: Add shared semantic type definitions

**Objective:** Create one source of truth for semantic transaction types and counting rules.

**Files:**

- Create: `src/modules/transaction/domain/transactionSemanticType.ts`
- Test: `tests/transactionSemanticType.test.ts`

**Implementation:**

```ts
export const TRANSACTION_SEMANTIC_TYPES = [
  'expense',
  'income',
  'own_transfer',
  'saving_deposit',
  'debt',
  'reimbursement',
  'cash_withdrawal',
  'group_payment',
] as const;

export type TransactionSemanticType = typeof TRANSACTION_SEMANTIC_TYPES[number];

export function isTransactionSemanticType(value: unknown): value is TransactionSemanticType {
  return typeof value === 'string'
    && (TRANSACTION_SEMANTIC_TYPES as readonly string[]).includes(value);
}

export function normalizeSemanticType(
  value: unknown,
  fallbackType: 'income' | 'expense' = 'expense'
): TransactionSemanticType {
  if (isTransactionSemanticType(value)) return value;
  return fallbackType === 'income' ? 'income' : 'expense';
}

export function countsAsRealExpense(semanticType: TransactionSemanticType | undefined): boolean {
  return semanticType === 'expense';
}

export function countsAsBudgetSpending(semanticType: TransactionSemanticType | undefined): boolean {
  return semanticType === 'expense';
}

export function countsAsIncome(semanticType: TransactionSemanticType | undefined): boolean {
  return semanticType === 'income';
}
```

**Tests:**

- unknown value falls back from legacy `expense` to `expense`;
- unknown value falls back from legacy `income` to `income`;
- `own_transfer`, `saving_deposit`, `debt`, `reimbursement`, `cash_withdrawal`, `group_payment` do **not** count as real expense;
- only `expense` counts as budget spending.

**Run:**

```bash
npm test -- tests/transactionSemanticType.test.ts
```

Expected: PASS.

---

## Task 2: Extend backend transaction domain model

**Objective:** Add optional `semanticType` to domain transaction interfaces while preserving legacy `type`.

**Files:**

- Modify: `src/modules/transaction/domain/transactionEntity.ts`
- Modify: `src/modules/voiceProcessing/domain/processedTransaction.ts`
- Modify: `src/modules/voiceProcessing/domain/transcriptionService.ts`

**Changes:**

1. Import `TransactionSemanticType` in `transactionEntity.ts`.
2. Add:

```ts
semanticType?: TransactionSemanticType;
```

3. In `originalParsing`, add optional:

```ts
semanticType?: TransactionSemanticType;
```

4. In `DetectedTransaction` and `ParsedTransaction`, add:

```ts
semanticType?: TransactionSemanticType;
```

**Compatibility rule:** all fields remain optional first. Do not break existing create/update callers in this task.

**Run:**

```bash
npm run build
```

Expected: TypeScript compiles.

---

## Task 3: Add persistence columns for SQLite and Supabase

**Objective:** Store semantic type in both local SQLite/TypeORM and Supabase.

**Files:**

- Modify: `src/shared/infrastructure/database/entities/Transaction.ts`
- Create: `migrations/007_add_transaction_semantic_type.sql`

**TypeORM entity change:**

```ts
@Column({ name: 'semanticType', default: 'expense' })
semanticType!: string;
```

Keep it as string in DB entity to avoid TypeORM enum migration friction; domain layer validates values.

**Supabase migration:**

```sql
alter table transactions
  add column if not exists semantic_type text not null default 'expense';

alter table transactions
  drop constraint if exists transactions_semantic_type_check;

alter table transactions
  add constraint transactions_semantic_type_check
  check (semantic_type in (
    'expense',
    'income',
    'own_transfer',
    'saving_deposit',
    'debt',
    'reimbursement',
    'cash_withdrawal',
    'group_payment'
  ));

create index if not exists idx_transactions_semantic_type on transactions(semantic_type);
create index if not exists idx_transactions_user_semantic_date on transactions(user_id, semantic_type, date desc);
```

**Important migration note:** Existing rows will default to `expense`. This is safe structurally but product-wise imperfect; later backfill/classification can fix old rows. Do not silently infer historical transfers in this task.

**Run:**

```bash
npm run build
```

Expected: PASS.

---

## Task 4: Map semantic type in repositories

**Objective:** Preserve `semanticType` through create/update/read for SQLite and Supabase.

**Files:**

- Modify: `src/modules/transaction/infrastructure/persistence/SqliteTransactionRepository.ts`
- Modify: `src/modules/transaction/infrastructure/persistence/SupabaseTransactionRepository.ts`
- Test: `tests/transactionRepositorySemanticType.test.ts` if repository tests already have DB harness; otherwise cover via controller/use-case tests in Task 6.

**SQLite create mapping:**

```ts
semanticType: normalizeSemanticType(transaction.semanticType, transaction.type),
```

**SQLite update mapping:**

```ts
if (updates.semanticType !== undefined) {
  updateData.semanticType = normalizeSemanticType(updates.semanticType, updates.type ?? 'expense');
}
```

**SQLite read mapping:**

```ts
semanticType: normalizeSemanticType(entity.semanticType, entity.type === TransactionType.INCOME ? 'income' : 'expense'),
```

**Supabase create mapping:**

```ts
semantic_type: normalizeSemanticType(transaction.semanticType, transaction.type),
```

**Supabase update mapping:**

```ts
if (updates.semanticType !== undefined) {
  updateData.semantic_type = normalizeSemanticType(updates.semanticType, updates.type ?? 'expense');
}
```

**Supabase read mapping:**

```ts
semanticType: normalizeSemanticType(row.semantic_type, row.type),
```

**Run:**

```bash
npm run build
npm run test:ci -- --runInBand
```

Expected: PASS.

---

## Task 5: Validate semantic type in create/update API boundary

**Objective:** API accepts and returns `semanticType`, but rejects invalid values.

**Files:**

- Modify: `src/shared/application/validation/validators.ts`
- Modify: `src/shared/application/validation/transactionValidator.ts`
- Modify: `src/modules/transaction/application/createTransaction.ts`
- Test: `tests/transactionRoutes.test.ts`

**Validator addition:**

```ts
import { isTransactionSemanticType, TransactionSemanticType } from '../../../modules/transaction/domain/transactionSemanticType';

static transactionSemanticType(value: any): Result<TransactionSemanticType, ValidationError> {
  if (!isTransactionSemanticType(value)) {
    return ResultHelper.failure(
      new ValidationError('semanticType must be one of: expense, income, own_transfer, saving_deposit, debt, reimbursement, cash_withdrawal, group_payment', 'semanticType')
    );
  }
  return ResultHelper.success(value);
}
```

**TransactionValidator:**

- `validate`: `semanticType` is optional. If absent, set via `normalizeSemanticType(undefined, data.type)`.
- `validatePartial`: validate only when present.

**CreateTransactionUseCase:**

Replace old type-only validation with:

```ts
if (!transaction.type || !['income', 'expense'].includes(transaction.type)) {
  return ResultHelper.failure(new ValidationError('Type must be "income" or "expense"'));
}

transaction.semanticType = normalizeSemanticType(transaction.semanticType, transaction.type);
```

**Route tests to add:**

1. POST `/api/transactions` with `semanticType: 'own_transfer'` calls create use case with that field.
2. POST with `semanticType: 'crypto_trade'` returns 400 and does not call create use case.
3. PUT update with `semanticType: 'saving_deposit'` passes field to update use case.

**Run:**

```bash
npm test -- tests/transactionRoutes.test.ts
npm run build
```

Expected: PASS.

---

## Task 6: Update OpenAI parsing contract and fallback parser

**Objective:** Voice/text parsing outputs semantic type from day one for new transactions.

**Files:**

- Modify: `src/shared/domain/constants/messages.ts`
- Modify: `src/modules/voiceProcessing/infrastructure/openAITranscriptionService.ts`
- Modify: `src/modules/voiceProcessing/application/processTextInput.ts`
- Modify: `src/modules/voiceProcessing/application/processVoiceInput.ts`
- Test: create `tests/semanticTransactionParsing.test.ts` or extend existing voice-processing tests if present.

**Prompt contract:** Update JSON schema instructions so transaction items include:

```json
{
  "intent": "transaction",
  "amount": 100000,
  "type": "expense",
  "semanticType": "own_transfer",
  "category": "transfer",
  "merchant": "TBC → Alif",
  "description": "Перевод между своими картами",
  "confidence": 0.9
}
```

**Classifier guidance in prompt:**

- “перевёл себе”, “с TBC на Alif”, “между картами”, “на другую свою карту” → `own_transfer`.
- “положил на вклад”, “копилка”, “депозит”, “инвестиции”, “капитал” → `saving_deposit`.
- “одолжил”, “дал в долг”, “вернул долг”, “мне вернули” → `debt` or `reimbursement` depending on wording; if creating Debt entity, preserve debt flow.
- “снял наличку” → `cash_withdrawal`.
- “скинулись”, “разделили чек”, “за всех заплатил” → `group_payment`.
- Normal purchases/services/food/transport → `expense`.
- Salary/incoming money → `income`.

**Parser change:** In `parseTransactionItem`, add:

```ts
const semanticType = normalizeSemanticType(item.semanticType, item.type === 'income' ? 'income' : 'expense');
```

Return `semanticType`.

**Simple parser change:** For `parseSimpleTextTransaction`, set `semanticType: 'expense'`.

**Process use cases:** When creating transaction and response DTO, pass `semanticType` and include it in `originalParsing`.

**Tests:** Use fake transcription service if easier.

Cases:

- `перевел с tbc на alif 500000` → no real expense; transaction gets `semanticType: own_transfer` if OpenAI fake returns it.
- simple fast-path `coffee 20000` → `semanticType: expense`.
- parsed `semanticType: saving_deposit` persists in create use case call.

**Run:**

```bash
npm test -- tests/semanticTransactionParsing.test.ts
npm run build
```

Expected: PASS.

---

## Task 7: Exclude non-real expenses from analytics/dashboard/budgets

**Objective:** Reports stop counting transfers/savings/debts as spending.

**Files to inspect and modify:**

- `src/modules/transaction/application/analyticsService.ts`
- `src/modules/dashboard/application/services/dashboardService.ts`
- `src/modules/budget/**`
- `src/shared/application/services/alertService.ts`
- any code found by:

```bash
rg "type === 'expense'|type !== 'income'|expenses \+=|totalExpenses|spent" src/modules src/shared -g '*.ts'
```

Use Hermes `search_files` instead of raw `rg` during implementation if following tool policy.

**Rule:** Replace raw checks like:

```ts
if (t.type === 'expense') expenses += t.amount;
```

with:

```ts
if (countsAsRealExpense(t.semanticType)) expenses += t.amount;
```

For income:

```ts
if (countsAsIncome(t.semanticType)) income += t.amount;
```

**Budget rule:** budget `spent` should include only `countsAsBudgetSpending(t.semanticType)`.

**Tests:** Add focused unit tests for the main calculation service(s). Minimum cases:

- normal expense 100k counts in expenses and budget spent;
- own_transfer 1m does not count;
- saving_deposit 500k does not count;
- debt 200k does not count;
- income 10m counts as income, not expense.

**Run:**

```bash
npm test -- tests/*analytics* tests/*budget* --runInBand
npm run test:ci
```

Expected: PASS.

---

## Task 8: Update Mini App transaction types and UI labels

**Objective:** Mini App displays semantic labels so user understands why a transaction is excluded from spending.

**Files:**

- Modify: `webapp/src/shared/types/transaction.ts`
- Modify: `webapp/src/entities/transaction/lib/toViewModel.ts`
- Modify: `webapp/src/entities/transaction/model/types.ts`
- Modify: `webapp/src/entities/transaction/ui/TransactionCard.tsx`
- Inspect/modify transaction create/edit forms under `webapp/src/pages` and `webapp/src/features`.

**Frontend types:**

```ts
export type TransactionSemanticType =
  | 'expense'
  | 'income'
  | 'own_transfer'
  | 'saving_deposit'
  | 'debt'
  | 'reimbursement'
  | 'cash_withdrawal'
  | 'group_payment';
```

Add optional `semanticType?: TransactionSemanticType` to `Transaction`, `CreateTransactionDTO`, `UpdateTransactionDTO`.

**Labels:**

```ts
const semanticTypeLabels: Record<TransactionSemanticType, string> = {
  expense: 'Расход',
  income: 'Доход',
  own_transfer: 'Перевод себе',
  saving_deposit: 'Вклад / накопление',
  debt: 'Долг',
  reimbursement: 'Возврат',
  cash_withdrawal: 'Наличные',
  group_payment: 'Групповой платёж',
};
```

**UI rule:** Transaction card should still show amount direction, but semantic badge should explain meaning. Example:

```text
-500 000 сум · Перевод себе
Не входит в расходы
```

**Build:**

```bash
npm run build:webapp
npm run build
```

Expected: PASS.

---

## Task 9: Add “needs review” queue foundation without full workflow

**Objective:** Preserve uncertainty for weekly review without building a full review UI yet.

**Files:**

- Modify: `src/modules/transaction/domain/transactionEntity.ts`
- Modify: `src/shared/infrastructure/database/entities/Transaction.ts`
- Modify: `migrations/007_add_transaction_semantic_type.sql` or create `008_add_transaction_review_flags.sql` if Task 3 already merged.
- Modify repositories and validators.

**Fields:**

```ts
needsReview?: boolean;
reviewReason?: string;
```

**Default rule:**

- `needsReview = true` if `confidence < 0.7`;
- `needsReview = true` for `group_payment` until split/share model exists;
- otherwise false.

**SQL:**

```sql
alter table transactions
  add column if not exists needs_review boolean not null default false;

alter table transactions
  add column if not exists review_reason text;

create index if not exists idx_transactions_user_needs_review on transactions(user_id, needs_review, date desc);
```

**Do not build full UI yet.** This is only data foundation for weekly review and Home “needs attention” later.

**Run:**

```bash
npm run build
npm run test:ci
```

Expected: PASS.

---

## Task 10: Add weekly review calculation skeleton

**Objective:** Create a pure domain/application service that can power weekly trustworthy review later.

**Files:**

- Create: `src/modules/transaction/application/weeklyReviewService.ts`
- Test: `tests/weeklyReviewService.test.ts`

**Service output shape:**

```ts
export interface WeeklyReviewSummary {
  period: { startDate: string; endDate: string };
  realExpenses: number;
  income: number;
  excluded: {
    ownTransfers: number;
    savingDeposits: number;
    debts: number;
    reimbursements: number;
    cashWithdrawals: number;
    groupPayments: number;
  };
  needsReviewCount: number;
  topExpenseCategories: Array<{ category: string; amount: number }>;
}
```

**Rule:** This service accepts transactions as input. Do not add controller/routes yet unless explicitly requested.

**Tests:**

- sums only `semanticType: expense` into `realExpenses`;
- separates own transfers/savings/debts/reimbursements/cash withdrawals/group payments;
- counts `needsReview`;
- top categories ignore excluded semantic types.

**Run:**

```bash
npm test -- tests/weeklyReviewService.test.ts
npm run build
```

Expected: PASS.

---

## Task 11: Update documentation and benchmark handoff

**Objective:** Document the new semantic layer and how it affects product direction.

**Files:**

- Modify: `docs/knowledge-base/01-architecture/transaction-debt-relationship-audit.md`
- Create or modify: `docs/knowledge-base/07-data-flow/semantic-transactions.md`
- Modify: `.hermes/plans/2026-07-29-finance-app-benchmark.md` if needed with a short “Implementation follow-up” link to this plan.

**Documentation must include:**

- legacy `type` vs new `semanticType` distinction;
- counting rules;
- examples in Russian/Uzbek/local banking context;
- migration notes;
- how weekly review should use `semanticType`.

**Run:**

```bash
npm run build
npm run test:ci
```

Expected: PASS.

---

## Suggested Implementation Order

### Slice A — Safe foundation

1. Task 1
2. Task 2
3. Task 3
4. Task 4
5. Task 5

Commit message:

```bash
git commit -m "feat(transactions): add semantic transaction type"
```

### Slice B — Parsing and correctness

6. Task 6
7. Task 7

Commit message:

```bash
git commit -m "feat(transactions): classify real expenses semantically"
```

### Slice C — Mini App visibility

8. Task 8

Commit message:

```bash
git commit -m "feat(webapp): show semantic transaction labels"
```

### Slice D — Weekly review foundation

9. Task 9
10. Task 10
11. Task 11

Commit message:

```bash
git commit -m "feat(review): add weekly semantic summary foundation"
```

---

## Verification Gate Before Merge/Push

Run the full project gate:

```bash
npm run verify
```

If too slow or blocked, run minimum:

```bash
npm run build
npm run test:ci
npm run build:webapp
```

Manual verification in Telegram/Mini App after implementation:

1. Enter normal spend: `кофе 25000` → visible as `Расход`, counted in monthly spend.
2. Enter own transfer: `перевел с TBC на Alif 500000` → visible as `Перевод себе`, not counted in expenses.
3. Enter deposit: `положил на вклад 1000000` → visible as `Вклад / накопление`, not counted in expenses.
4. Enter debt: `одолжил Азизу 200000` → debt flow still works; not counted as normal spending unless product chooses otherwise later.
5. Open analytics/budget widgets → totals should not include transfers/savings/debts.

---

## Risks and Tradeoffs

1. **Historical rows default to `expense`:** Existing transfers may still pollute analytics until backfilled. Do not auto-backfill without review because wrong inference can damage trust.
2. **`type` vs `semanticType` confusion:** Keep `type` for amount direction/cashflow, `semanticType` for meaning/counting. Document this clearly.
3. **Debt overlap:** Debt module already exists. Avoid duplicating debt logic in transactions. `semanticType: debt` is for accounting classification; debt entity remains source of truth for person/status/payment history.
4. **Group payment ambiguity:** Without split/share model, group payment should be `needsReview` or excluded from real expense by default to avoid overstating spend.
5. **OpenAI prompt drift:** Add parser tests around semanticType so future prompt changes do not silently drop it.
6. **Supabase production migration:** Applying SQL has external effect. Require explicit user approval before running migration against production Supabase.

---

## Open Questions Before Execution

1. Should `cash_withdrawal` be excluded forever, or only until user records cash spending?
2. For `group_payment`, should payer’s full amount count first and later be offset by reimbursements, or should it go to needs-review until split is known?
3. Should `saving_deposit` count as capital/net-worth movement later? P0 says no expense; P2 can add assets/net worth.
4. Should old transactions be reviewed manually, or should we build a conservative backfill script with preview-only output first?

Recommended answers for MVP:

- `cash_withdrawal`: exclude from expense, mark as cash movement.
- `group_payment`: `needsReview` until split is known.
- `saving_deposit`: exclude from expense; show as capital movement later.
- historical data: no automatic backfill yet; add review/backfill preview later.
