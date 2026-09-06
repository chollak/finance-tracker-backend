# Архив задач — Семантические транзакции

Отдельная серия FT-SEM: разделение «трата» / «долг» / «перевод», needsReview, недельный разбор и учёт семантики в итогах.

Закрыто задач: **6**. Это архив: задачи здесь не переоткрываются и не редактируются.
Активная доска — [`TASKS.md`](../../../TASKS.md), решения по плану — [`decisions.md`](../decisions.md).

---

### FT-SEM-001: Add needsReview transaction foundation

Status: done
Priority: high
Owner: Claude Code, QA by Hermes
Type: feature-foundation

Context:
Semantic transaction types are already stored and used by analytics/budgets/UI. The next pre-redesign blocker is trust/correction flow: uncertain transactions must be explicitly marked as needing review so analytics and future UI can avoid silently lying.

Goal:
Add a `needsReview` boolean foundation across backend domain/API/persistence and voice/text parsing. This is a data/contract slice only; avoid broad redesign.

Definition of Done:
- [x] Transaction domain/entity/API DTOs support optional `needsReview` with default `false`
- [x] SQLite/TypeORM/Supabase persistence maps `needsReview`
- [x] New migration file is created but not executed against production/Supabase
- [x] OpenAI parsing contract can return `needsReview`
- [x] Text/voice processing passes `needsReview` into transaction creation
- [x] Fast-path/simple manual quick add defaults to `needsReview: false`
- [x] Focused tests cover default false, explicit true, parser propagation
- [x] Hermes runs focused tests and `npm run verify` before marking done

Verification:
- `npm test -- tests/transactionRoutes.test.ts tests/semanticTransactionParsing.test.ts tests/processTextInput.test.ts tests/createTransaction.test.ts tests/updateTransaction.test.ts --runInBand` — passed, 5 suites / 37 tests.
- `npm run verify` — passed, 23 suites / 213 tests, webapp build, dependency-cruiser, and madge circular check.

---

### FT-SEM-002: Add semantic correction foundation

Status: done
Priority: high
Owner: Claude Code, QA by Hermes
Type: feature-foundation

Goal:
Allow users/frontends to update `semanticType` and clear `needsReview` safely, so future redesign can implement correction chips without inventing backend contracts.

Definition of Done:
- [x] Existing update transaction flow supports `semanticType` and `needsReview`
- [x] API validation rejects invalid semantic types and accepts valid correction payloads
- [x] Tests cover correcting an uncertain transaction and analytics recalculation after correction
- [x] No broad UI redesign

---

Verification:
- `npm run build:webapp` — passed.
- `npm run verify` — passed, 23 suites / 213 tests.

---

### FT-SEM-003: Weekly review foundation

Status: done
Priority: medium
Owner: Claude Code, QA by Hermes
Type: feature-foundation

Goal:
Create backend/application-level weekly summary primitives that separate real expenses, income, excluded movements, reimbursements, and needs-review transactions. Do not implement final redesign yet.

Definition of Done:
- [x] Weekly summary use case/service exists behind testable application code
- [x] Summary separates real expenses from non-expense movements
- [x] Needs-review transactions are exposed separately
- [x] Tests cover own transfers, saving deposits, reimbursements, debts, cash withdrawals, and group payments

---

Verification:
- `npm test -- tests/weeklyReviewService.test.ts --runInBand` — passed, 1 suite / 8 tests.
- `npm run build` — passed.
- `npm run verify` — passed, 24 suites / 221 tests.

---

### FT-SEM-004: Redesign readiness QA

Status: done
Priority: medium
Owner: Hermes, optional Claude Code browser QA
Type: qa

Goal:
Before applying the final visual redesign, verify that semantic contracts, correction foundation, and weekly summary foundation are green and documented.

Definition of Done:
- [x] `npm run verify` passes
- [x] Mini App build passes
- [x] Current Telegram Mini App can be opened via tunnel
- [x] Remaining redesign-only tasks are separated from foundation blockers

---

### FT-SEM-005: Finalized totals respect needsReview

Status: done
Priority: high
Owner: Claude Code, QA by Hermes
Type: feature-consistency

Goal:
Make analytics, budgets, Home trust formula, and AI prompts consistent with the weekly-review trust rule: `needsReview` transactions are excluded from finalized totals until corrected.

Definition of Done:
- [x] Analytics totals/category/trends/spending patterns exclude `needsReview`
- [x] Budget spending excludes `needsReview`
- [x] HomeTrustSummary excludes `needsReview` from finalized formula/chips
- [x] English AI prompt includes `needsReview` rules matching Russian prompt
- [x] Focused tests added/updated
- [x] `npm run verify` passes

Verification:
- `npm test -- tests/analytics.test.ts tests/budget.test.ts tests/dashboardService.test.ts tests/weeklyReviewService.test.ts --runInBand` — passed, 4 suites / 51 tests.
- `npm run verify` — passed, 24 suites / 227 tests.
- Mini App tunnel probe — `root:200`, `health:200`.

FT-SEM-004 verification:
- Claude Code readiness QA report: `/tmp/finance-redesign-readiness-report.md`
- Local `.env` uses `DATABASE_TYPE=sqlite`; Supabase migrations 007/008 remain a pre-production/prod-deploy action, not a local redesign blocker.
- Current tunnel/menu status verified: `root:200`, `health:200`, `menu.type=web_app`.

---

### FT-SEM-006: Semantic transaction list UI slice

Status: done
Priority: high
Owner: Claude Code, QA by Hermes
Type: frontend-ui/semantic-redesign

Goal:
Start the visual redesign on the safest vertical slice: transaction rows/cards should explain semantic meaning directly in the list, including real expenses, non-expense movements, and transactions that need review.

Definition of Done:
- [x] Transaction list rows show semantic badges via existing `semanticType` view-model fields
- [x] `needsReview` rows show a prominent “Нужно проверить” badge
- [x] One-tap correction chips update `{ semanticType, needsReview: false }` without breaking row click-to-edit
- [x] Non-expense movement amounts render neutral instead of expense-red
- [x] Shared correction chip component is reused by list rows and transaction card
- [x] `npm run build:webapp` passes
- [x] `npm run verify` passes
- [x] Mobile screenshot QA passes at 375/390/412 px with sample semantic transactions

Verification:
- `npm run build:webapp` — passed.
- `npm run verify` — passed, 24 suites / 227 tests, backend build, webapp build, dependency-cruiser, and madge circular check.
- Local health probe — `root:200`, `health:200`.
- Visual QA sample screenshots:
  - `/tmp/ft-semantic-transaction-ui-sample/transactions-375.png`
  - `/tmp/ft-semantic-transaction-ui-sample/transactions-390.png`
  - `/tmp/ft-semantic-transaction-ui-sample/transactions-412.png`
- Visual QA metrics: `/tmp/ft-semantic-transaction-ui-sample/metrics.json` — 4 rows rendered, 0 console errors, 0 bad responses at each width.

Notes:
- Browser QA with `AUTH_MODE=telegram` produced expected local auth 401 noise outside real Telegram initData; final visual QA used guest IndexedDB fixture with safe sample data.
- Existing Vite >600 kB chunk-size warning remains unrelated to this slice.

---
