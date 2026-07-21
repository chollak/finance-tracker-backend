# Auth / User Resolution Boundary Matrix

> Status: FT-024 audit/decision matrix. This document records current auth, guest, ownership, and userId-resolution boundaries before any strict resolver implementation.

## Purpose

The backend supports several identity modes:

- authenticated Telegram Mini App users
- development bypass users (`X-Dev-User-Id`) in non-production
- guest users (`guest_*`)
- legacy/raw user IDs in a few compatibility paths

The goal is to avoid accidental security regressions by documenting which boundaries are strict, loose, or policy-dependent.

## Current Middleware Semantics

### `requireAuth`

Strict auth boundary.

- Allows health check.
- Allows `X-Dev-User-Id` only outside production.
- Requires `Authorization: tma <initData>` otherwise.
- Validates Telegram Web App initData hash and expiry.
- Responds with 401 for missing/invalid auth.

Used for:

- admin/global surfaces
- `/api/users/*`
- admin OpenAI usage routes
- selected transaction analytics/global routes

### `optionalAuth`

Loose auth boundary.

- If no auth header, continues unauthenticated.
- If invalid auth format, continues unauthenticated.
- If valid auth, attaches `telegramUser`.

Used for resource-scoped routes where controller fetches the resource and calls `verifyResourceOwnership(...)`.

Current route families:

- budget by-id routes
- debt by-id / payment routes

### `allowGuestMode`

Hybrid boundary.

- Allows `guest_*` user IDs without Telegram auth.
- Requires auth for non-guest user IDs.
- Used before `verifyOwnership` on user-scoped routes.

Used for:

- transaction user-scoped routes
- budget user-scoped routes
- debt user-scoped routes
- dashboard routes
- voice text/voice input routes

### `verifyOwnership`

Route-param/body ownership guard.

- Works with `allowGuestMode` / resolved user data.
- Ensures non-guest callers cannot access another user's user-scoped route.
- Guest users are allowed for matching `guest_*` flows.

### `verifyResourceOwnership`

Resource-scoped ownership guard.

- Fetch resource first.
- If `allowGuest=true` and resource owner starts with `guest_`, bypasses auth.
- Otherwise requires `req.telegramUser` and `userModule`.
- Resolves authenticated Telegram user through `GetUserUseCase`.
- Fails closed if auth/userModule/ownership cannot be verified.

Used inside:

- transaction by-id operations
- budget by-id operations
- debt by-id/payment operations

### `createUserResolutionMiddleware`

User ID normalization boundary.

- Extracts user ID from params/query/body.
- `guest_*` passes through as guest.
- UUID passes through.
- Other values resolve through `resolveUserIdToUUID(...)`.
- Missing userId usually skips by default (`skipIfNoUserId=true`).
- Resolver errors map to `USER_RESOLUTION_ERROR` in this middleware.

### `resolveUserIdToUUID`

Current loose resolver helper.

- Rejects empty/whitespace-only IDs.
- Passes through guest and UUID IDs.
- Resolves telegramId to UUID through `GetOrCreateUserUseCase`.
- On resolver failure, logs and returns the original ID for backward compatibility.

FT-017D decision: do not globally change this helper to fail-closed yet.

## Route Boundary Matrix

| Route family | Route style | Auth middleware | User resolution | Ownership check | Guest allowed | Strictness |
|---|---|---|---|---|---:|---|
| Health | global | none | none | none | n/a | open |
| User routes | `/api/users/*` | `requireAuth` | use case by telegramId/id | controller self-access check | no | strict |
| Transaction global/admin | `/api/transactions`, `/analytics` | `requireAdmin` | none | admin only | no | strict/admin |
| Transaction user-scoped analytics/list | `/api/transactions/.../:userId` | `allowGuestMode` | route middleware | `verifyOwnership` | yes | hybrid |
| Transaction by-id CRUD/archive | `/api/transactions/:id` | `allowGuestMode` | controller/helper | `verifyResourceOwnership` | yes for guest-owned resources | hybrid/resource-strict |
| Voice text-input | `/api/voice/text-input` | `allowGuestMode` | controller resolver if available | auth/guest only, no resource owner | yes | hybrid/compat |
| Voice upload | `/api/voice/voice-input` | `allowGuestMode` | controller resolver if available | auth/guest only, no resource owner | yes | hybrid/compat |
| Budget user-scoped | `/api/budgets/users/:userId/...` | `allowGuestMode` | route middleware | `verifyOwnership` | yes | hybrid |
| Budget by-id | `/api/budgets/:budgetId` | `optionalAuth` | controller/resource lookup | `verifyResourceOwnership` | yes for guest-owned resources | resource-strict |
| Debt user-scoped | `/api/debts/user/:userId` | `allowGuestMode` | route middleware | `verifyOwnership` | yes | hybrid |
| Debt by-id/payment | `/api/debts/:debtId...` | `optionalAuth` | controller/resource lookup | `verifyResourceOwnership` | yes for guest-owned resources | resource-strict |
| Dashboard | `/api/dashboard/:userId...` | `allowGuestMode` + sometimes premium | route middleware | `verifyOwnership` | yes | hybrid/premium |
| Subscription | `/api/subscription/...` | route-dependent middleware | route/body resolver | varies | yes for free-tier status | policy-dependent |
| OpenAI usage | `/api/openai/usage...` | `requireAdmin` | none | admin only | no | strict/admin |

## Strict vs Loose Recommendations

### Keep loose for now

Keep current compatibility behavior for:

- Telegram bot text/voice handlers
- Telegram stats/today/budget commands
- early-MVP guest flows
- backward-compatible voice text-input behavior until product policy changes

### Prefer strict for future implementation

Introduce a strict resolver/helper for:

- authenticated user routes
- ownership/security-sensitive API routes
- resource-scoped routes where a resolution failure should not silently fall back
- future production-only monetization/limit enforcement if Shukur chooses fail-closed policy

Recommended future API:

```ts
resolveUserIdToUUIDLoose(...)  // current behavior
resolveUserIdToUUIDStrict(...) // implemented; throws on resolver failure
```

Do not silently change the current helper globally.

## Findings

### B1 — `optionalAuth` ignores invalid auth format

This is intentional for guest/resource-scoped routes, but surprising:

- invalid auth format continues unauthenticated
- controller then may allow guest-owned resources or reject non-guest resources via ownership

Recommendation: keep for now, but test any route where invalid auth should fail immediately.

### B2 — `allowGuestMode` is central to user-scoped route safety

Routes using `allowGuestMode + verifyOwnership` are only as clear as their userId extraction and guest detection.

Recommendation: maintain route tests around guest/non-guest behavior for any modified route family.

### B3 — Subscription behavior remains policy-dependent

Subscription middleware currently has explicit fail-open behavior when user UUID cannot be resolved.

Do not change without product/security decision.

### B4 — Voice input compatibility remains policy-dependent

`voiceProcessingController` still supports compatibility behavior around userId input. Do not change without product decision and route tests.

## Recommended Next Tasks

### FT-024A — Add strict resolver helper without migrating routes

Status: done.

Implemented:

- Added `resolveUserIdToUUIDStrict(...)`.
- Kept `resolveUserIdToUUID(...)` fail-open behavior unchanged.
- Added focused tests for UUID/guest passthrough, telegramId resolution, empty-id validation, and fail-closed resolver errors.
- No routes were migrated yet.

Use strict resolver only after selecting a specific security-sensitive boundary and adding route/middleware coverage.

### FT-024B — Migrate one strict route boundary

Risk: medium.

Candidate after tests:

- `userResolutionMiddleware` strict path for required-user routes
- one authenticated user route

### FT-024C — Invalid auth behavior tests for resource routes

Risk: low.

- Lock current `optionalAuth` behavior if we intentionally keep it.
- Or decide route families where invalid auth should be rejected.

## Stop Conditions

Stop for Shukur decision before changing:

- subscription fail-open/fail-closed behavior
- voice text-input missing userId behavior
- guest access policy for debt/budget/transaction resources
- production auth behavior
