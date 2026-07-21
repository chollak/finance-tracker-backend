# DTO / Schema Validation Consistency Audit

> Status: FT-023 audit. This document records current validation patterns and the recommended policy before introducing any new validation framework.

## Scope

This is an audit and policy document. It does not change runtime behavior.

Reviewed validation surfaces:

- controller-level defensive checks
- use-case validation
- shared validation helpers
- transaction validators
- subscription controller validation
- debt/budget/dashboard validation cleanup from FT-020B/C/D

## Current Validation Layers

### 1. Controller-level validation

Used for request/route shape checks:

```ts
if (!userId) {
  return handleControllerError(ErrorFactory.validation('User ID is required'), res);
}
```

Current examples:

- DashboardController missing `userId`
- BudgetController missing `userId`
- DebtController missing `userId` / `debtId` / `paymentId`
- SubscriptionController missing `userId`, `limitType`, invalid `limitType`
- Transaction controller route parameter/update-body validation

Controller validation should be limited to HTTP/request concerns:

- missing route/body/query params
- invalid enum string from HTTP body/query
- JSON shape that would prevent calling a use case safely

### 2. Use-case validation

Used for domain/application input checks:

```ts
if (!transaction.amount || transaction.amount <= 0) {
  return ResultHelper.failure(new ValidationError('Amount must be greater than 0'));
}
```

Current examples:

- `CreateTransactionUseCase`
- `CreateDebtUseCase`
- `PayDebtUseCase`
- `GetUserUseCase`
- `UpdateUserUseCase`
- Subscription use cases

Use-case validation should remain the source of truth for business/application invariants:

- amount > 0
- supported transaction/debt types
- active debt payment rules
- subscription limit inputs
- required domain fields

### 3. Shared validators

Existing reusable validation helpers:

```text
src/shared/application/validation/validators.ts
src/shared/application/validation/transactionValidator.ts
```

These already provide:

- `Validators.required`
- `Validators.number`
- `Validators.positiveNumber`
- `Validators.oneOf`
- `Validators.dateString`
- `Validators.amount`
- `TransactionValidator.validate(...)`
- `TransactionValidator.validatePartial(...)`

Observation:

- These helpers exist but are not used consistently across all modules.
- Introducing a new schema library now would duplicate existing helpers.

## Current Good Direction

FT-020B/C/D removed the most harmful pattern from module controllers:

```text
client input error → raw Error → 500
```

Current module-controller scan after FT-020D:

```text
handleControllerError(new Error(...)) → 0 matches in src/modules
```

This means normal client validation failures now generally map to:

```text
400 VALIDATION_ERROR
```

## Findings

### V1 — Validation is split, but not fundamentally broken

The project has multiple validation locations, but the split is reasonable:

- controllers validate HTTP shape;
- use cases validate application/domain invariants;
- shared validators exist for reusable transaction-style validation.

Recommendation:

Do not introduce a schema library yet.

### V2 — Shared validators should be adopted opportunistically

`Validators` / `TransactionValidator` are useful, but converting every use case at once would be broad and risky.

Recommendation:

Use shared validators only when touching a use case for another reason, or in a small TDD slice.

### V3 — Error message style is not fully standardized

Examples vary:

```text
User ID is required
userId is required
Amount must be greater than 0
amount must be a number
```

Recommendation:

Do not churn messages globally now. Message changes can break tests/clients. Standardize only inside new/refactored slices.

### V4 — Numeric parsing at controller boundaries needs caution

Controllers often parse strings:

```ts
parseFloat(amount)
parseInt(req.query.limit as string)
```

Risks:

- `parseFloat('abc')` becomes `NaN` and may reach use case validation differently.
- Query defaults can hide invalid query inputs.

Recommendation:

Add route/controller tests before changing parsing behavior.

### V5 — Transaction validation is the best future consolidation candidate

`TransactionValidator` already exists, and transaction controller is the largest API surface.

Recommendation:

Before transaction controller split/refactor, consider one slice:

```text
FT-023A: use TransactionValidator.validatePartial for update route body validation
```

Only after route tests cover current behavior.

## Validation Policy

### Keep this layering

```text
Controller: HTTP shape / request parsing / route params
Use case: business invariants / domain rules
Shared validators: reusable primitive/domain validators
Repository: persistence errors only, not request validation
```

### Do not add now

Do not add a new dependency such as Zod/Yup/Joi yet.

Reasons:

- existing helpers are enough for current backend;
- adding a schema framework would cause large churn;
- current priority is stabilizing architecture, not changing API contracts broadly.

### Use this pattern for new controller validation

```ts
return handleControllerError(ErrorFactory.validation('Field is required', 'field'), res);
```

### Use this pattern for use-case validation

```ts
return ResultHelper.failure(new ValidationError('Field is required', 'field'));
```

### Use shared validators when they reduce duplication

```ts
const amountResult = Validators.amount(input.amount);
if (!amountResult.success) return ResultHelper.failure(amountResult.error);
```

## Recommended Next Tasks

### FT-023A — Transaction update validation helper slice

Risk: medium-low.

Prerequisite:

- keep `tests/transactionRoutes.test.ts` green;
- add one targeted test for invalid update body if needed.

Goal:

- evaluate replacing manual update-body checks with `TransactionValidator.validatePartial(...)` for one route/use case boundary.

Stop if response messages/statuses would change broadly.

### FT-023B — Controller validation message field audit

Risk: low.

Goal:

- list validation errors that omit a field name;
- decide whether field names are useful for frontend forms.

No implementation unless needed for Mini App UX.

### FT-023C — Subscription route validation tests

Risk: low-medium.

Goal:

- route tests for invalid/missing `limitType`;
- guest subscription status behavior;
- missing `userId` shape.

Useful before subscription controller/helper refactor.

## Decision Summary

Current validation architecture is acceptable after FT-020 cleanup.

Recommended path:

```text
No new validation dependency now.
Keep controller/use-case split.
Adopt existing shared validators opportunistically in small TDD slices.
Do not globally rewrite validation messages yet.
```
