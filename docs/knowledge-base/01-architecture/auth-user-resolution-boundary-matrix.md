# Auth / User Resolution Boundary Matrix

> Status: FT-024 audit/decision matrix. This document records current auth, guest, ownership, and userId-resolution boundaries before any strict resolver implementation.

## 2026-10-29 — the legacy userId routes act only for the signed-in user (FT-162)

Since 2026-10-21 someone else's `userId` got `403`, so nothing leaked. Left from the security review of that day: user
resolution ran before the ownership check and created a `users` row for any Telegram id it was given (the shadow-user
problem); a `userId` that was not a string gave `500`; the subscription actions and `POST /api/transactions` took the
user from the body. Budgets and debts are out of the UI (Д2), but their routes are live — FT-136 removes them.

| Was | Now |
|---|---|
| `:userId` routes: `allowGuestMode, resolveUser, verifyOwnership` — `GET /api/budgets/users/597843119/budgets` signed in as someone else made a `users` row for `597843119`, then `403` | `allowGuestMode, verifyOwnership, resolveUser`: refused before anything is resolved, no row. Also `0131184740` for `131184740` — resolving it would have made a row |
| `verifyOwnership` checked one userId (path, else body, else query) against what resolution left | Every userId the request carries — path, query and body — must be the signed-in Telegram id, compared as the string resolution would look up; one naming anyone else is `403 ACCESS_DENIED` |
| A userId that is a number, an array (`?userId=a&userId=b`), an object or a blank string: `500 USER_RESOLUTION_ERROR`, or let through by `writeAsSignedInUser` | `400 INVALID_USER_ID` everywhere — `verifyOwnership`, `writeAsSignedInUser` (quick capture, voice) and user resolution itself (it still serves the admin grant). `null` counts as given; only a missing userId is "none" |
| `GET /api/subscription/:userId`, `POST /check-limit`, `/cancel`, `/start-trial`: the user from the path or the body (`req.resolvedUser?.id \|\| req.body.userId`); without a body userId the actions were `400 userId is required` | `requireAuth, verifyOwnership, createResolveCurrentUserMiddleware`: the signed-in user (`currentUserId`); a body or path userId is only checked, never read as the user |
| `POST /api/transactions`: `writeAsSignedInUser` put the signed-in id into the body, user resolution read it from there | `requireAuth, verifyOwnership, createResolveCurrentUserMiddleware`: the record's owner is `currentUserId`. The Mini App outbox still sends its own `userId` as a string — accepted. The route needs a `UserModule`, as the other milestone-10 routes |

Unchanged: the admin grant (`POST /api/subscription/grant`) names whom it is for in the body and creates that user on
first contact — it is the admin's choice; `GET /api/transactions/analytics` and `/api/openai/usage*` have `requireAdmin`
without `requireAuth` before them (always `401`, fail-closed — FT-174); the guest branches in the same controllers are
dead code until FT-136.
Tests: `tests/legacyUserIdRoutes.test.ts` (every legacy route: someone else's id `403` and no `users` row, a blank or
non-string id `400`, the own id as before), the FT-162 cases in `tests/userFromAuth.test.ts`.

## 2026-10-27 — the iPhone Shortcut's token bound to its owner, in production too (FT-155)

The quick capture from the iPhone (Shortcut on the Action Button, FT-160) writes to the live instance, which runs with
`NODE_ENV=production` (decision 2026-10-26). Before, the path was `403 SHORTCUT_CAPTURE_DISABLED` in production, and
outside it the token holder chose the owner by `X-Shortcut-User-Id`.

| Was | Now |
|---|---|
| Production: every Shortcut request `403 SHORTCUT_CAPTURE_DISABLED` | On with `SHORTCUT_CAPTURE_TOKEN` of 32+ characters and `SHORTCUT_CAPTURE_OWNER` in `ALLOWED_TELEGRAM_IDS`; with neither set, `403 SHORTCUT_CAPTURE_DISABLED` as before. A half or wrong setting stops the start (`AppConfig.validate`), like an empty list in FT-153 |
| The token holder wrote for whoever `X-Shortcut-User-Id` named | The capture is for `SHORTCUT_CAPTURE_OWNER`; the header is optional, and naming anyone else is `403 ACCESS_DENIED` |
| The header id compared as a string: `0900000143` was `403 ACCESS_NOT_ALLOWED` though the list reads it as `900000143` | Ids compare as numbers, as the list does (`telegramIdOf`) |
| A request was a Shortcut one only with `X-Shortcut-User-Id` | Also with `X-Shortcut-Capture-Token` alone (even empty); a missing, empty or wrong token is `401 INVALID_SHORTCUT_TOKEN`, checked in constant time before anything about the owner |

Unchanged: outside production without an owner the header names it, and without a token only a request from this machine
goes through (`403 SHORTCUT_CAPTURE_TOKEN_REQUIRED`); `X-Dev-User-Id` never counts in production, also not next to a
Shortcut token; `req.telegramUser` is not fabricated for a Shortcut request. A repeat with the same `clientId` answers
with the first capture's records (FT-106). Revoking: a new `SHORTCUT_CAPTURE_TOKEN` in `.env.local` and a restart.
Rules: `src/shared/domain/access/shortcutCaptureAccess.ts`, used by `allowShortcutCapture` and `AppConfig.validate`.
Tests: `tests/shortcutCaptureOwner.test.ts`, the FT-155 cases in `tests/localDevAuth.test.ts` and
`tests/allowedTelegramIds.test.ts`.

Known and left: one token per server (no per-device tokens, expiry or audit trail); the Shortcut shares the per-IP AI
limit (20 requests / 15 minutes with `/api/voice/*`) — no separate limit for a non-Telegram source; behind
`tailscale serve` the address it counts is the tailnet device's, from `X-Forwarded-For` with `trust proxy 1`.

## 2026-10-27 — closed access by `ALLOWED_TELEGRAM_IDS` (FT-153)

The live instance moves to the owner's PC (decision 2026-10-26). Tailscale closes the API, not the bot; free-tier
limits are off (Д3), so anyone who found the bot would spend the OpenAI key. With a list set:

| Boundary | Someone not on the list |
|---|---|
| Bot | `allowedUsersOnly` is the first `bot.use`: no user row, no OpenAI, nothing written, no answer; `warn` with the Telegram id — the first refusal of an id at once, its repeats as one `(repeats)` line with `skipped` per 10 minutes (FT-166). An update with no sender is dropped |
| API | `createAllowedUsersMiddleware` in `buildServer`, right after the web session: initData, the session cookie or `X-Dev-User-Id` of someone else — `403 ACCESS_NOT_ALLOWED` before any route resolves the user; logged like the bot's refusals (FT-166). A request that proves no user goes on to its route |
| Shortcut | `allowShortcutCapture`: an owner (`X-Shortcut-User-Id`) not on the list — `403 ACCESS_NOT_ALLOWED`, after the token check. In production the owner is `SHORTCUT_CAPTURE_OWNER`, which must be on the list (FT-155) |
| Web login (FT-128) | The bot ignores `/start login_…` and the buttons, so the login is never confirmed. `OpenWebSessionUseCase` also refuses a login confirmed before the list changed (`POST /api/auth/session` — `403 ACCESS_NOT_ALLOWED`, no user row); a session issued before the change gets `403` from the API gate |
| Notices | Итоги дня and reminders go only to the users on the list (`NotificationModule` takes it from `AppConfig` unless given one); the other rows of `users` (test users) stay as they are |

Empty list: everyone, as before — outside production only; production does not start without it. An entry that is not
a positive whole number stops the start everywhere: skipped quietly, a typo would lock the owner out or leave the list
empty. Tests: `tests/allowedTelegramIds.test.ts`, `tests/telegramAllowedUsers.test.ts`, the FT-153 cases in
`tests/dailySummary.test.ts` and `tests/botReminders.test.ts`.

## 2026-10-21 — the user only from authentication (supersedes the guest rows below)

Found while checking the local run: the dev server `npm run dev:miniapp` puts on the internet accepted unproven
identities, and several routes took the user from the request. Changed:

| Was | Now |
|---|---|
| `X-Dev-User-Id` signed in as anyone outside production — through the tunnel too | Only for a request from this machine (`isLocalRequest`): over loopback, `Host` is `localhost` / `127.0.0.1` / `[::1]` (no DNS rebinding), no `Cf-Connecting-Ip` / `Forwarded`, and an `X-Forwarded-For` only of loopback — the Vite proxy sends one (`xfwd`), so `vite --host` and a phone on the Wi-Fi do not qualify |
| `X-Shortcut-User-Id` without `SHORTCUT_CAPTURE_TOKEN` wrote as any owner | From the phone (tunnel, Wi-Fi) the token is required — `403 SHORTCUT_CAPTURE_TOKEN_REQUIRED` |
| `allowGuestMode`: a `guest_*` id went through without signing in | Same as `requireAuth`: there are no guests (Д4); the name stays until FT-136 |
| `verifyOwnership` let a UUID through (`resolvedUser.telegramId` null) and any non-numeric id in the fallback | The path/body/query userId must equal the signed-in Telegram id; a UUID or guest id is `403` |
| `verifyResourceOwnership({ allowGuest })` opened guest-owned records to anyone | No guest option: every record needs its signed-in owner |
| `POST /api/transactions` had no authentication and took `body.userId` (and `?userId=`, which user resolution reads first) | `requireAuth` + `writeAsSignedInUser`: the signed-in user; a path, query or body userId naming someone else is `403` |
| `POST /api/quick-capture`, `/api/voice/text-input`, `/api/voice/voice-input` took `body.userId` (text-input defaulted to `'1'`) | The signed-in user (`writeAsSignedInUser`); the Shortcut path keeps its header owner |
| `PUT /api/transactions/:id` taught learning with `body.userId` | With the record owner, checked above |

`requireAuth` no longer skips a path `/health`: the health check has its own route without auth, and the skip let
`/api/<router>/health` past sign-in. Checked live, also through a real quick tunnel: the dev header `401`, a Shortcut
without a token `403`, `POST /api/transactions` without signing in `401`.

Tests: `tests/localDevAuth.test.ts`, `tests/userFromAuth.test.ts`.

Known and left (security review 2026-10-21): with `SHORTCUT_CAPTURE_TOKEN` set, the token holder still chooses the
owner by `X-Shortcut-User-Id` (closed by FT-155: the token is bound to `SHORTCUT_CAPTURE_OWNER`); user resolution creates a
user row for an unknown Telegram id before the ownership check refuses it (the shadow-user problem — closed by FT-162 on
these routes); an array or a number in `userId` on routes with user resolution gives `500` instead of `400` (closed by
FT-162); with `trust proxy 1` a Wi-Fi client can
set `X-Forwarded-For` to dodge IP rate limits (`isLocalRequest` reads the socket, not `req.ip`); `requireAdmin` routes
have no `requireAuth` before them and always answer `401`. Not changed: the legacy user-scoped routes keep their
`:userId` paths (budgets, debts, dashboard, subscription — out of the UI since Д2); with the strict `verifyOwnership` they
answer only their own user. FT-136 removes the guest branches that are now dead code.

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
- Allows `X-Dev-User-Id` only outside production and only for a request from this machine (`isLocalRequest`: loopback, no forwarding headers) — never through the `dev:miniapp` tunnel (2026-10-21).
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

Route-param/query/body ownership guard (strict since 2026-10-21, before user resolution since FT-162).

- Runs after `requireAuth` / `allowGuestMode` and **before** `resolveUser` / `createResolveCurrentUserMiddleware`.
- Every `userId` in the path, query and body must be the signed-in Telegram id as a non-blank string:
  someone else's id (also a UUID, a `guest_*` id, `0131184740` for `131184740`) — `403 ACCESS_DENIED`;
  a number, an array, an object, `null` or a blank string — `400 INVALID_USER_ID`.
- No `userId` at all — passes: the route takes the user from authentication.

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
- A userId that is not a non-blank string — `400 INVALID_USER_ID` (FT-162), not a resolver error.
- Resolver errors map to `USER_RESOLUTION_ERROR` in this middleware.
- Creates the user for a Telegram id it does not know (`GetOrCreateUserUseCase`), so on user routes it runs only
  after `verifyOwnership` (FT-162). Only the admin grant uses it for an id other than the signed-in user's.

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
| Transaction history, totals, frequent | `GET /api/transactions` (FT-107), `/totals`, `/frequent` | `requireAuth` | signed-in user (`createCurrentUserMiddleware`) | none — no userId taken | no | strict |
| Transaction global analytics (admin) | `GET /api/transactions/analytics` | `requireAdmin` without `requireAuth` — always `401` (fail-closed, FT-174) | none | admin only | no | strict/dead |
| Transaction create | `POST /api/transactions` | `requireAuth` | signed-in user (`createResolveCurrentUserMiddleware`) | `verifyOwnership` on a body/query userId, before resolution (FT-162) | no | strict |
| Transaction user-scoped analytics/list | `/api/transactions/.../:userId` | `allowGuestMode` (= `requireAuth`) | route middleware, after the check (FT-162) | `verifyOwnership` | no | strict |
| Transaction by-id CRUD/archive | `/api/transactions/:id` | `allowGuestMode` | controller/helper | `verifyResourceOwnership` | yes for guest-owned resources | hybrid/resource-strict |
| Voice text-input | `/api/voice/text-input` | `allowGuestMode` | controller resolver if available | auth/guest only, no resource owner | yes | hybrid/compat |
| Voice upload | `/api/voice/voice-input` | `allowGuestMode` | controller resolver if available | auth/guest only, no resource owner | yes | hybrid/compat |
| Budget user-scoped | `/api/budgets/users/:userId/...` | `allowGuestMode` (= `requireAuth`) | route middleware, after the check (FT-162) | `verifyOwnership` | no | strict |
| Budget by-id | `/api/budgets/:budgetId` | `optionalAuth` | controller/resource lookup | `verifyResourceOwnership` | yes for guest-owned resources | resource-strict |
| Debt user-scoped | `/api/debts/user/:userId` | `allowGuestMode` (= `requireAuth`) | route middleware, after the check (FT-162) | `verifyOwnership` | no | strict |
| Debt by-id/payment | `/api/debts/:debtId...` | `optionalAuth` | controller/resource lookup | `verifyResourceOwnership` | yes for guest-owned resources | resource-strict |
| Dashboard | `/api/dashboard/:userId...` | `allowGuestMode` (= `requireAuth`) + sometimes premium | route middleware, after the check (FT-162) | `verifyOwnership` | no | strict/premium |
| Subscription (own) | `GET /api/subscription/:userId`, `POST /check-limit`, `/cancel`, `/start-trial` | `requireAuth` | signed-in user (`createResolveCurrentUserMiddleware`, FT-162) | `verifyOwnership` on any path/body/query userId, before resolution | no | strict |
| Subscription grant | `POST /api/subscription/grant` | `requireAuth` + `requireAdmin` | body userId (the admin's target; a non-string is `400`) | admin only | no | strict/admin |
| OpenAI usage | `/api/openai/usage...` | `requireAdmin` without `requireAuth` — always `401` (fail-closed, FT-174) | none | admin only | no | strict/dead |

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
