# Transaction / Debt Relationship Audit

> Status: FT-021 audit. This document records current debt ↔ transaction behavior and accounting ambiguities before changing any money semantics.

## Scope

This is an audit only. It does not change behavior.

Reviewed source:

- `src/modules/debt/application/createDebt.ts`
- `src/modules/debt/application/payDebt.ts`
- `src/modules/debt/domain/debtEntity.ts`
- `src/modules/transaction/domain/transactionEntity.ts`
- `src/modules/transaction/application/analyticsService.ts`
- `src/modules/voiceProcessing/application/processTextInput.ts`
- `src/modules/voiceProcessing/application/processVoiceInput.ts`
- `tests/debt.test.ts`

## Current Domain Model

### Debt entity

```ts
DebtEntity {
  id: string
  userId: string
  type: 'i_owe' | 'owed_to_me'
  personName: string
  originalAmount: number
  remainingAmount: number
  status: 'active' | 'paid' | 'cancelled'
  relatedTransactionId?: string
}
```

Debt types:

| Debt type | Meaning |
|---|---|
| `i_owe` | user owes someone |
| `owed_to_me` | someone owes the user |

### Transaction debt markers

```ts
Transaction {
  isDebtRelated?: boolean
  relatedDebtId?: string
}
```

The transaction side links to debt via:

```text
Transaction.relatedDebtId
```

The debt side has:

```text
DebtEntity.relatedTransactionId
```

but current create flow does **not** populate `relatedTransactionId` on the returned/stored debt after creating the transaction.

## Current Create Debt Flow

### `moneyTransferred = false`

No transaction is created.

Example:

```text
"Sasha owes me 20000"
```

Result:

```text
Debt created only
No income/expense transaction
```

### `moneyTransferred = true`

`CreateDebtUseCase` creates a debt first, then creates a linked transaction:

```ts
isDebtRelated: true
relatedDebtId: debt.id
category: 'debt'
```

Transaction type depends on debt type:

| Debt type | Meaning | Created transaction type |
|---|---|---|
| `owed_to_me` | user gave money | `expense` |
| `i_owe` | user received money | `income` |

This is directionally correct for cash movement, but these transactions are marked `isDebtRelated`.

## Current Payment Flow

`PayDebtUseCase` always updates debt/payment state first.

If `createTransaction = true`, it creates a linked transaction:

```ts
isDebtRelated: true
relatedDebtId: debt.id
category: 'debt'
```

Payment transaction type:

| Debt type | Payment meaning | Created transaction type |
|---|---|---|
| `i_owe` | user pays someone back | `expense` |
| `owed_to_me` | user receives repayment | `income` |

This is also directionally correct for cash movement.

## Current Analytics Behavior

`AnalyticsService` skips debt-related transactions in at least balance calculation:

```ts
if (transaction.isDebtRelated) {
  continue;
}
```

Implication:

- Debt cash movements are recorded as transactions.
- But they may be excluded from some analytics to avoid treating loans/repayments as ordinary income/expense.

This may be the intended model, but it must be made explicit before building product analytics.

## Current Voice Flow

Voice/text processing parses debt intents with:

```ts
moneyTransferred: boolean
```

Then calls `CreateDebtUseCase`.

Current response field:

```ts
linkedTransactionId: d.moneyTransferred ? result.data.id : undefined
```

This appears semantically wrong: `result.data.id` is the debt ID, not the created transaction ID. Since `CreateDebtUseCase` does not return or persist the created transaction ID back onto debt, the voice layer cannot currently report the real linked transaction ID.

This is a likely bug/contract mismatch, but it should be fixed carefully with tests because response shape may be consumed by clients.

## Confirmed Good Properties

- Debt state and payment state are updated even if linked transaction creation fails.
- Linked transaction creation failure logs a warning and does not fail the main debt/payment operation.
- `moneyTransferred=false` avoids creating fake cash movement.
- Payment transactions can be disabled with `createTransaction=false`.
- Tests cover the core direction mapping for debt/payment transactions.

## Ambiguities / Risks

### D1 — Debt-side `relatedTransactionId` is unused/unpopulated

`DebtEntity` contains `relatedTransactionId`, but linked transaction creation only populates transaction-side fields:

```ts
Transaction.relatedDebtId = debt.id
```

Risk:

- API clients may expect `DebtEntity.relatedTransactionId` to identify the linked transaction.
- Voice responses currently appear to expose debt ID as `linkedTransactionId`.

Recommendation:

- Either remove/deprecate debt-side `relatedTransactionId`, or populate it explicitly.
- Do not do this without tests over create debt + response shape.

### D2 — Debt transactions are cash movements but excluded from analytics

The system records loan disbursement/receipt and repayment as income/expense transactions, but marks them `isDebtRelated`.

Risk:

- If analytics excludes debt-related transactions everywhere, cash-flow views may not match actual money movement.
- If analytics includes them everywhere, ordinary spending/income may be distorted.

Recommendation:

Define two analytics modes later:

```text
operating spending/income: excludes debt-related transactions
cash-flow: includes debt-related transactions with debt labels
```

No code change yet.

### D3 — Transaction type alone is not enough to explain debt semantics

A debt repayment can be `income` or `expense`, but it is not ordinary income/expense.

Recommendation:

Keep using:

```ts
isDebtRelated: true
relatedDebtId: string
category: 'debt'
```

and avoid deriving product analytics from transaction `type` alone.

### D4 — `moneyTransferred` meaning is critical

`moneyTransferred=false` means "track a debt promise/obligation, no cash movement yet".

`moneyTransferred=true` means "cash already moved, so create a transaction".

Recommendation:

Document this in user-facing/business docs before changing voice UX.

### D5 — Linked transaction failure is non-fatal

Debt creation/payment succeeds even if linked transaction creation fails.

This is currently graceful but can create accounting gaps.

Recommendation:

Keep for now, but later consider an audit/event log or warning surface if transaction creation fails.

## Recommended Next Tasks

### FT-021A — Fix voice linkedTransactionId contract

Status: done.

Implemented:

- Added a regression test proving the text-input debt response must not report the debt ID as `linkedTransactionId` when no actual transaction ID is available.
- `ProcessTextInputUseCase` and `ProcessVoiceInputUseCase` now set `linkedTransactionId` from `result.data.relatedTransactionId` only.
- Since current debt creation does not populate `relatedTransactionId`, the field is omitted instead of lying with the debt ID.

Follow-up remains: decide whether to populate `Debt.relatedTransactionId` or remove/deprecate that field.

### FT-021B — Decide analytics modes

Risk: product decision.

Define:

```text
operating analytics = excludes debt-related transactions
cash-flow analytics = includes debt-related transactions
```

Do not implement until product direction is chosen.

### FT-021C — Debt linked transaction persistence decision

Risk: medium.

Options:

1. Store `relatedTransactionId` on Debt after linked transaction creation.
2. Remove/deprecate `relatedTransactionId` from Debt and rely on `Transaction.relatedDebtId`.
3. Keep both, but enforce consistency.

Recommended default:

```text
Use Transaction.relatedDebtId as source of truth for now.
Do not persist Debt.relatedTransactionId until repository/schema behavior is audited.
```

### FT-021D — Add debt cash-flow route tests before analytics features

Risk: low.

Add tests around:

- create debt with money transferred;
- repayment transaction creation;
- analytics exclusion of `isDebtRelated` transactions.

## Decision Summary

Current architecture is internally usable but needs explicit product semantics before finance analytics features:

```text
Debt records obligation state.
Debt-related transactions record cash movement.
Current analytics partially excludes debt-related transactions.
```

Do not change money semantics automatically. The next safe implementation slice is likely FT-021A, because it appears to be a response-contract bug rather than a product accounting decision.
