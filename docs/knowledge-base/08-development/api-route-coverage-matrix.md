# API Route Coverage Matrix

> Status: FT-022 audit. This matrix records current API route families and their automated route-level test coverage. It is a planning artifact for future route tests, not a requirement to test every route.

## Current Baseline

Current route-level suite:

```text
tests/apiRoutes.test.ts
```

Current full verification after FT-020A:

```text
12 suites passed
143 tests passed
npm run verify passed
```

## Coverage Philosophy

Do not test every route mechanically. Prioritize route tests for:

- auth / guest / ownership boundaries
- client validation vs server error mapping
- response-shape contracts used by frontend/bot
- route wiring that uses multiple middlewares
- high-risk money/debt/subscription actions

Prefer unit/use-case tests for pure business logic and route tests for HTTP/middleware behavior.

## Route Family Matrix

| Route family | Representative routes | Current route-test coverage | Risk | Recommendation |
|---|---|---:|---|---|
| Health / global middleware | `GET /api/health`, 404, CORS, malformed JSON, global error handler | partial/high-value covered | low | Keep current coverage. |
| Voice | `POST /api/voice/text-input`, `POST /api/voice/voice-input` | text-input covered for JSON parsing, guest, auth, validation | medium | Add voice upload coverage only if endpoint changes; avoid heavy file tests for now. |
| Debt | `POST /api/debts/user/:userId`, `GET /api/debts/user/:userId`, `GET /api/debts/:debtId`, pay/cancel/delete | create/list auth covered; null getDebt not-found covered | high | Next route tests should cover pay debt auth/ownership and validation errors. |
| Transaction | CRUD, analytics, archive, batch archive | not covered at route level except indirectly via use-case tests | high | Add focused coverage before any transaction controller split/refactor. |
| Budget | user budgets, summaries, alerts, by-id update/delete/recalculate | not covered at route level | medium | Add missing-user validation and ownership route tests before controller cleanup. |
| Subscription | status, check-limit, grant, cancel, start-trial | covered at use-case level, not route level | medium-high | Add route tests around guest status/check-limit and invalid limitType. |
| User | get/create/update user | covered at use-case/helper level, not route level | medium | Add auth/self-access tests if user routes become active frontend surface. |
| Dashboard | insights/alerts/quick-stats with premium/read-only middleware | not covered at route level | medium | Add one auth/premium boundary test if dashboard route behavior changes. |
| OpenAI usage | admin-only usage endpoints | not covered at route level | low-medium | Add admin auth tests only if exposing this UI/API more actively. |

## Current Tested API Behaviors

From `tests/apiRoutes.test.ts`:

- `GET /api/health` returns healthy JSON.
- unknown API route returns 404 JSON with original path.
- CORS preflight short-circuits with 200.
- `POST /api/voice/text-input`:
  - parses JSON body
  - allows guest user without auth
  - rejects non-guest without auth
  - validates missing text as 400
- Debt routes:
  - allow guest debt creation without auth
  - reject non-guest debt list without auth
  - allow dev auth bypass in non-production
  - map null `getDebt(...?withPayments=true)` lookup to 404, not 500
- Global error handler:
  - `ValidationError` → 400
  - generic `Error` → 500
  - malformed JSON → 400 `INVALID_JSON`

## High-Value Next Route Tests

### FT-022A — Transaction route ownership / validation slice

**Why:** `transactionController.ts` is the largest and riskiest controller. Before splitting/refactoring it, add focused route coverage.

Candidate tests:

- `GET /api/transactions/:id` returns 404 when use case returns `NotFoundError`.
- `DELETE /api/transactions/:id` rejects non-owner / unauthenticated non-guest.
- `PUT /api/transactions/:id` rejects empty update body with 400 validation.

### FT-022B — Budget/debt raw validation error slices

**Why:** FT-018 found raw `new Error('User ID is required')` branches that map to 500.

Candidate tests:

- direct controller test or minimal router test for missing userId branch
- assert 400 `VALIDATION_ERROR`
- replace raw Error with `ErrorFactory.validation`

### FT-022C — Subscription route validation slice

**Why:** subscription use cases are well-tested, but route input mapping is not.

Candidate tests:

- `POST /api/subscription/check-limit` invalid `limitType` → 400 validation
- guest subscription status returns free-tier response
- missing `userId` / `limitType` → 400 validation

### FT-022D — User route auth/self-access slice

**Why:** FT-017 changed user use-case contracts. Route-level auth/self-access behavior should be locked if frontend starts using `/api/users` directly.

Candidate tests:

- authenticated user can get own record
- authenticated user cannot get another telegramId
- missing user maps to 404

## Do Not Add Yet

Avoid broad route test expansion for:

- every dashboard insight endpoint
- every OpenAI usage admin endpoint
- full voice file upload behavior
- all transaction archive/batch variants

Those should wait until the relevant controller is actively changed.

## Recommended Order

```text
FT-022A transaction route ownership/validation slice
FT-022B budget/debt raw validation slices
FT-022C subscription route validation slice
FT-024 auth/user resolution boundary matrix
FT-019 controller Result helper refactor after enough route coverage exists
```

Rationale: add route safety net before controller-helper refactors or transaction controller splits.

## Open Decisions

No product decision required for the matrix itself.

Future behavior decisions still need Shukur before implementation:

- subscription limit fail-open vs fail-closed
- voice text-input missing userId default `'1'`
- transaction/debt accounting semantics
