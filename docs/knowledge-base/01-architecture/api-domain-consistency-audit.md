# API / Domain Consistency Audit

> Status: FT-018 audit. This document records API/domain consistency findings after the foundation cleanup. It is intentionally an audit and task-splitting document, not a broad refactor.

## Scope

Audited:

- Express composition and route mounts
- module controllers
- module application use cases
- Result/error handling conventions
- userId / UUID / guest handling at API boundaries
- route-test coverage direction

Primary files inspected:

```text
src/delivery/web/express/expressServer.ts
src/delivery/web/express/routes/*.ts
src/delivery/web/express/middleware/*.ts
src/modules/*/presentation/**/*.ts
src/modules/*/interfaces/*.ts
src/modules/*/application/*.ts
src/shared/infrastructure/utils/controllerHelpers.ts
src/shared/infrastructure/utils/ownershipVerification.ts
```

## Current Baseline

The repository is in a good state for incremental work:

```text
npm run verify passes
12 Jest suites
142 tests
backend build + webapp build + dependency-cruiser + circular scan pass
```

Recent foundation work already improved several contracts:

- `GetUserUseCase` now returns `Result.failure(NotFoundError)` for missing users.
- `UpdateUserUseCase.execute()` now returns `Result<User>`.
- `resolveUserIdToUUID()` rejects empty user IDs.
- API 404 responses report the original unmatched path.
- Jest application logs are quiet by default.

## Inventory

### Controllers

| Controller | Approx. size | Pattern notes |
|---|---:|---|
| `transactionController.ts` | 530 lines | Largest controller; many inline route handlers; repeated Result unwrapping and ownership checks. |
| `debtController.ts` | 320 lines | Class controller; consistent enough but repeated manual `if (!result.success)` handling. |
| `budgetController.ts` | 230 lines | Similar to debt; uses `new Error(...)` for validation in several places. |
| `subscriptionController.ts` | 221 lines | Does not use Result pattern in application use cases; has special guest response behavior. |
| `dashboardController.ts` | 196 lines | Mostly service calls; uses raw `new Error(...)` for missing user. |
| `voiceProcessingController.ts` | 139 lines | Validates body manually; text input defaults missing `userId` to `'1'` for backward compatibility. |
| `userController.ts` | 124 lines | Improved by FT-017; still manually maps use-case Results. |
| `openAIUsageController.ts` | 105 lines | Admin surface; smaller controller. |

### Route Surfaces

Main route families:

```text
/api/health
/api/transactions
/api/voice
/api/budgets
/api/debts
/api/dashboard
/api/subscription
/api/users
/api/openai
```

Route coverage currently exists for critical slices only:

- health
- 404
- CORS preflight
- voice text-input guest/auth/error behavior
- debt guest/dev-auth behavior
- global error handler mapping

There is no full matrix coverage for every route family yet.

## Findings

### F1 — Controller Result unwrapping is repetitive and inconsistent

**Risk:** medium-low  
**Type:** architecture / maintainability  
**Evidence:** Controllers manually repeat variants of:

```ts
if (!result.success) {
  return handleControllerError(result.error, res);
}
return handleControllerSuccess(result.data, res, ...);
```

Observed heavily in:

- `transactionController.ts`
- `debtController.ts`
- `budgetController.ts`
- `userController.ts`

There is already a helper:

```ts
handleResult(...)
```

but it is not used in controllers and its current type is narrow (`error?: AppError`), while many use cases return plain `Error` as well.

**Recommendation:** Create/extend a small controller helper for Result responses before refactoring many routes.

Candidate future task:

```text
FT-019: Standardize controller Result handling helper
```

Suggested small slice:

1. Add a helper that accepts `Result<T, Error>`.
2. Apply it to one low-risk controller family, preferably `userController` or one debt/budget method.
3. Preserve HTTP response shape with route tests.

---

### F2 — Validation errors sometimes use raw `new Error(...)`

**Risk:** medium  
**Type:** API consistency  
**Evidence:** Several controllers call:

```ts
handleControllerError(new Error('User ID is required'), res)
```

Examples:

- `budgetController.ts`
- `debtController.ts`
- `dashboardController.ts`

Raw `Error` maps to:

```text
500 INTERNAL_ERROR
```

through `handleControllerError`, even when the issue is a client validation problem.

**Recommendation:** Replace raw validation errors with `ErrorFactory.validation(...)` in small TDD slices.

Candidate future task:

```text
FT-020: Normalize controller validation errors
```

Good first slice:

- budget/debt/dashboard missing `userId` branches
- assert they map to 400 validation errors, not 500

---

### F3 — Use-case return conventions still vary by module

**Risk:** medium  
**Type:** domain/application consistency  
**Evidence:**

Result-pattern use cases:

- transaction create/update/delete/archive/get-by-id
- budget create/update/delete/get
- debt create/update/delete/pay/get
- user get/update after FT-017

Raw-return / service-style use cases:

- `GetTransactionsUseCase.execute()` returns raw list
- `GetUserTransactionsUseCase.execute()` returns raw list
- subscription use cases return raw objects/booleans/nulls
- voice processing use cases return raw processed result and throw on some errors
- dashboard/analytics services return raw objects

This is not automatically wrong. Query services can return raw values. But the convention is not documented per category.

**Recommendation:** Document a project-level convention instead of forcing every use case into `Result`.

Candidate convention:

| Use-case type | Preferred convention |
|---|---|
| Commands / mutations | `Result<T>` for business/validation failures |
| By-id resource lookup | `Result<T>` with `NotFoundError` |
| List/query service | raw `T[]` or raw DTO is acceptable if no business failure expected |
| External I/O / AI | may throw infrastructure errors; controller maps them |
| Subscription service-style calls | keep raw for now; audit separately if product behavior changes |

Candidate future task:

```text
FT-021: Document use-case return conventions
```

---

### F4 — `transactionController.ts` is too large for safe long-term evolution

**Risk:** medium  
**Type:** maintainability  
**Evidence:**

`transactionController.ts` is around 530 lines and contains:

- admin analytics routes
- user analytics routes
- transaction CRUD
- archive/unarchive/batch archive
- ownership helper
- validation/mapping logic
- learning-enabled update branching

This file is currently covered partially by unit/use-case tests and critical API tests, but it is still a high-change surface.

**Recommendation:** Do not split it immediately. First add a route inventory/coverage matrix, then split by behavior group only if tests exist.

Candidate future task:

```text
FT-022: API route coverage matrix
FT-023: Transaction controller route-group split plan
```

Potential future grouping:

- transaction CRUD routes
- transaction analytics routes
- archive routes

---

### F5 — Guest/auth/ownership behavior is powerful but spread across many layers

**Risk:** medium-high  
**Type:** security/architecture  
**Evidence:** User identity can flow through:

- `allowGuestMode`
- `optionalAuth`
- `verifyOwnership`
- `createUserResolutionMiddleware`
- `verifyResourceOwnership`
- `resolveUserIdToUUID()` loose behavior
- route-specific fallback to `req.params.userId` / `req.body.userId`

Recent FT-017 decisions improved this, but route-by-route strictness is still not documented.

**Recommendation:** Do not globally change resolver behavior. Create a boundary matrix: route family → auth mode → guest allowed? → resolver mode → ownership verification.

Candidate future task:

```text
FT-024: Auth/user resolution boundary matrix
```

This should precede any strict resolver implementation.

---

### F6 — Subscription middleware intentionally fail-opens limits

**Risk:** product/security medium  
**Type:** product behavior decision  
**Evidence:** In `subscriptionMiddleware.ts`, if user UUID cannot be resolved:

```ts
// If user doesn't exist, allow action (fail open)
next();
```

This may be acceptable for early MVP/backward compatibility, but it is a product policy: resolution/storage errors can allow actions without enforcing limits.

**Recommendation:** Do not change now without product decision. Record as a clear future question.

Candidate future task:

```text
FT-025: Subscription limit fail-open policy decision
```

Decision options:

- fail-open for availability
- fail-closed for monetization/abuse control
- fail-open only for guest/local/dev, fail-closed for authenticated production users

---

### F7 — Voice text-input defaults missing `userId` to `'1'`

**Risk:** medium  
**Type:** backward compatibility / data correctness  
**Evidence:** `voiceProcessingController.ts`:

```ts
let userId = req.body.userId || '1';
```

This can preserve legacy behavior, but it is not aligned with current userId/guest/UUID direction. For authenticated or real production traffic, a silent default can mix data.

**Recommendation:** Do not remove immediately. Add coverage and decide whether only guest mode may omit `userId`, or whether missing `userId` should be a validation error.

Candidate future task:

```text
FT-026: Voice text-input userId default policy
```

---

### F8 — Route test coverage is intentionally partial

**Risk:** medium-low  
**Type:** test coverage  
**Evidence:** `tests/apiRoutes.test.ts` covers high-value critical behavior but not every route family.

Missing route-family coverage examples:

- transaction CRUD/update/archive
- budget routes
- subscription controller routes
- user controller auth/self-access routes
- dashboard premium/read-only routes
- OpenAI admin routes

**Recommendation:** Build a coverage matrix first, then add only high-value route tests.

Candidate future task:

```text
FT-022: API route coverage matrix and next high-value route tests
```

---

### F9 — API response envelope is mostly consistent, but not fully specified

**Risk:** low-medium  
**Type:** API contract documentation  
**Evidence:** Controller helper returns:

```ts
{
  success: true,
  data,
  message?,
  timestamp
}
```

App/global errors and some middleware errors return different shapes, for example:

```ts
{ success: false, error, code }
```

or:

```ts
{ error: '...', code: '...' }
```

This is common in MVP code but should be documented before client/UI hardening.

**Recommendation:** Write an API response contract doc before broad response-shape refactors.

Candidate future task:

```text
FT-027: API response envelope contract
```

---

## Recommended Next Tasks

### FT-019 — Standardize controller Result handling helper

**Risk:** medium-low  
**Why next:** It reduces repetition without product semantics.  
**Approach:** TDD on one controller slice.  
**Do not:** mass-refactor all controllers at once.

### FT-020 — Normalize raw validation errors in controllers

**Risk:** medium-low  
**Why next:** Raw `new Error('User ID is required')` incorrectly maps to 500.  
**Approach:** Add route/controller tests for one family, then replace with `ErrorFactory.validation`.

### FT-022 — API route coverage matrix

**Risk:** low  
**Why next:** It tells us where to add route safety tests before larger refactors.

### FT-024 — Auth/user resolution boundary matrix

**Risk:** low for documentation; medium for implementation  
**Why next:** Prevents accidental security regressions before strict resolver work.

### FT-025 — Subscription limit fail-open policy decision

**Risk:** product/security  
**Why not automatic:** Needs a policy choice from Shukur before behavior change.

### FT-026 — Voice text-input userId default policy

**Risk:** product/data correctness  
**Why not automatic:** Removing default `'1'` can affect backward compatibility and existing clients.

## Recommended Autonomous Order

Safe autonomous sequence:

```text
FT-019 controller Result helper slice
FT-020 raw validation error normalization slice
FT-022 API route coverage matrix
FT-024 auth/user resolution boundary matrix
```

Stop for Shukur decision before:

```text
FT-025 subscription limit fail-open behavior
FT-026 voice text-input missing userId behavior
any change to transaction/debt accounting semantics
```

## Open Questions for Shukur

1. Should subscription limit enforcement fail-open or fail-closed when user resolution/storage fails?
2. Should `/api/voice/text-input` still default missing `userId` to `'1'`, or should it require explicit `userId` / guest id?
3. Should API error envelopes be made fully uniform now, or later after Mini App/product direction is clearer?
4. Should transaction controller be split after route coverage improves?
