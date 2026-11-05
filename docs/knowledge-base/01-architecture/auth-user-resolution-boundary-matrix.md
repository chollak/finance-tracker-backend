# Auth / User Resolution Boundary Matrix

> Status: FT-024 audit/decision matrix. This document records current auth, ownership, and userId-resolution boundaries before any strict resolver implementation. There are no guests: the browser's guest mode went with decision Д4 (FT-128), the backend's guest branches in #206.
>
> #264 (2026-11-04): budgets — `BudgetModule`, `/api/budgets/*` — are removed; the budget routes in the dated sections below are history.
>
> #265 (2026-11-04): the debt routes — `/api/debts/*` — and the debt use cases that resolved their owner themselves are removed; the debt routes in the dated sections below are history.
>
> #274 (2026-11-05): the user routes — `/api/users/*` — are removed: no client called them, and `PUT /api/users/:id` answered `404` before its owner check, telling whether a UUID was someone's. A user is made only on the first request (`createCurrentUserMiddleware`, `getOrCreate`); settings change through `PATCH /api/settings`, the user taken from sign-in.

## 2026-11-04 — one Telegram id rule in the resolver; no grant without a user (#230)

Found in the review of #224: the resolver took a Telegram id by its own regex (`/^0*[1-9]\d*$/`, any length, looked
up as written), while `ALLOWED_TELEGRAM_IDS` and the Shortcut owner go by `telegramIdOf` (below 2^53, leading zeros are
the same id). So the admin grant with `"0597843119"` made a second user of the same person, 30 digits made a `users`
row, a UUID no user has got a subscription — `subscriptions.user_id` has no foreign key — and a user's UUID in upper
case was looked up exactly and found no one. Admin only, no hole.

| Was | Now |
|---|---|
| Resolver: a Telegram id is any positive whole number in digits, looked up as written — `0597843119` and `597843119` are two users | `resolvableUserIdOf` (`userIdResolver.ts`) reads a Telegram id by `telegramIdOf`: `0597843119` is the user of `597843119`, created as `597843119` on first contact; a number from 2^53 on is no id. Both resolvers and `createUserResolutionMiddleware` go by it, so the admin grant with such a number is `400 INVALID_USER_ID`, no row. `isResolvableUserId` is gone: only tests called it |
| Admin grant to a UUID: passed through, `200`, a subscription for no one | `GrantPremiumUseCase` asks `GrantTargets.exists` (from `UserModule.exists`) first: `404 NOT_FOUND`, nothing created or expired |
| A UUID passed as written: `isUUID` ignores case, `users.id` is lower case and looked up exactly, so the admin grant to a user's UUID in upper case was `404` | `resolvableUserIdOf` gives a UUID in lower case: the same user |
| Fail-open resolver returned the id as given | Returns the Telegram id without leading zeros |

Chosen: leading zeros are the **same** user, not refused — one rule means one behaviour wherever a Telegram id is read,
and the list and the Shortcut owner already read them so. Every id the server itself resolves has no leading zeros
(`ctx.from.id`, the signed-in id from initData, the cookie, `X-Dev-User-Id` and the Shortcut owner are numbers or
`telegramIdOf`-read), so only an id typed into the admin grant changes. Not changed: `verifyOwnership` still compares
the path, query and body id with the signed-in id as written — `0131184740` for `131184740` stays `403`; stricter than
the resolver, it lets no one else in. No migration: rows already in `users` are not touched.
Tests: `tests/userResolution.test.ts` (leading zeros — the same user, created without them; 2^53, 2^53 + 1 and 30
digits refused, no user; 2^53 − 1 resolved; fail-open without zeros; a UUID in upper case — lower case),
`tests/legacyUserIdRoutes.test.ts` (grant with `0597843119` — the same user; a user's UUID in upper case — that user;
2^53 + 1 and 30 digits — `400`; an unknown UUID — `404`, no subscription),
`tests/subscription.test.ts` (`GrantPremiumUseCase` refuses an unknown user before touching subscriptions).

## 2026-11-04 — the web voice routes are gone (#221)

`POST /api/voice/text-input` and `/voice-input` had no client: the bot takes a voice from Telegram, the iOS app sends
text to `/api/quick-capture`. Both are `404` now (`tests/deadVoiceRoutes.test.ts`); their rows below stay as history.

## 2026-11-04 — the resolver makes no user of an id that is no UUID and no Telegram id (#224)

Found in the review of #206: `resolveUserIdToUUID` resolved every id that was not a UUID as a Telegram id, so
`POST /api/subscription/grant` with `{"userId":"guest_zzz"}` made a `users` row and a premium subscription for it. No
hole — the route is admin only — but garbage in the database; before #206 any other non-numeric id did the same.

| Was | Now |
|---|---|
| `resolveUserIdToUUID` / `resolveUserIdToUUIDStrict`: a UUID passed as it is, any other id went to `GetOrCreateUserUseCase` as a Telegram id | Only a UUID or a Telegram id — a positive whole number in digits (`isResolvableUserId`); anything else (`guest_zzz`, `abc`, `-5`, `1.5`, `0`) is a `ValidationError` before the user module is asked, so no row |
| `createUserResolutionMiddleware` refused only a userId that was not a non-blank string (`400 INVALID_USER_ID`, FT-162) | Also a string that is no UUID and no Telegram id, by the same `isResolvableUserId`, before resolving: the admin grant answers `400 INVALID_USER_ID`, no `users` row, no subscription |

The check is in the resolver, the one door every caller goes through to `GetOrCreateUserUseCase` by a given id — the
bot, quick capture and voice, the record counters, the middleware — so no new caller can bring the garbage back. The
middleware checks first with the same function because its answer for a bad id is `400 INVALID_USER_ID` in its own
shape (`{ success, error, code }`, as for a non-string id on the same route), while an error from resolving is `500`.
Unchanged: a Telegram id, also a big one (past 2^32) and one with leading zeros, is resolved as it is written (until
#230), creating the user on first contact; a UUID passes as it is (until #230: in lower case since). Every id the server itself produces is already one of the two:
`ctx.from.id` in the bot, the signed-in Telegram id (initData, the session cookie, the Shortcut owner, the app token),
a record's owner UUID — so a numeric `X-Dev-User-Id`, the Shortcut token with `X-Shortcut-User-Id`, the app token and
`ALLOWED_TELEGRAM_IDS` work as before. A record counter that meets an old owner id of another form now skips counting
with an error in the log instead of making a row. Not through the resolver, so not changed here: the milestone-10 routes
(`createResolveCurrentUserMiddleware`) and the bot's `bot.use` that gives every sender a row hand the signed-in Telegram
id to `GetOrCreateUserUseCase` themselves; the debt use cases resolve their owner with their own `isUUID` /
`GetOrCreateUserUseCase` — they get a UUID from the route middleware or the debt record, never an id from a request.
Tests: `tests/userResolution.test.ts` (the ids refused by both resolvers and `isResolvableUserId`, no user made; big
Telegram ids and one with leading zeros resolved as written — until #230), `tests/legacyUserIdRoutes.test.ts` (the grant:
`guest_zzz`, `abc`, `-5`, `1.5`, `0` — `400 INVALID_USER_ID`, no row, no subscription; a Telegram id and a UUID granted
as before).

## 2026-11-04 — no guest mode in the backend (#206)

Since 2026-10-21 a `guest_*` id opened nothing: `allowGuestMode` was `requireAuth` under its old name, and
`verifyOwnership` refused a `guest_*` id as someone else's. What was left were branches no request could reach. Removed:

| Was | Now |
|---|---|
| `allowGuestMode` (= `requireAuth`) on the `:userId` routes of transactions, budgets and debts | `requireAuth` itself; the function is gone |
| `resolveUserIdToUUID` / `resolveUserIdToUUIDStrict` / `tryResolveUserIdSync` returned a `guest_*` id as it was; `isGuestUser` | Only a UUID passes as it is; any other id is resolved as a Telegram id. `isGuestUser` is gone |
| `createUserResolutionMiddleware` set `resolvedUser = { id: 'guest_…', isGuest: true }`; `isResolvedUserGuest` | No guest branch; `ResolvedUser` has no `isGuest`; `isResolvedUserGuest` is gone |
| `GET /api/subscription/:userId` answered a `guest_*` user with a made-up free tier | The signed-in user's subscription only (`currentUserId` was never a guest id since FT-162) |
| The Express subscription middleware skipped a `guest_*` id | No skip (the middleware has had no route since #205) |

Unchanged: sign-in by initData, the browser session (FT-128), `X-Dev-User-Id` outside production from this machine,
the Shortcut token on `POST /api/quick-capture` and the app token on the six FT-218 routes, `ALLOWED_TELEGRAM_IDS`
(`403 ACCESS_NOT_ALLOWED`), `verifyOwnership` and `verifyResourceOwnership`. The by-id routes of budgets and debts keep
`optionalAuth`: the controller's owner check answers a request without sign-in `403 AUTHORIZATION_ERROR`, as before.
A record left in the database with a `guest_*` owner is nobody's to open.

Answers (checked live with curl): `GET /api/budgets/users/guest_abc/budgets` without sign-in — `401 MISSING_AUTH_HEADER`;
signed in — `403 ACCESS_DENIED`, no `users` row (`/api/users/guest_abc/budgets` is no route: `404`). A `guest_*` id that reached the resolver would now be resolved as a
Telegram id and create a `users` row; on HTTP only the admin grant can pass one there — every other route checks the id
with `verifyOwnership` first or takes the user from sign-in. Closed in #224: the resolver refuses such an id, the grant
answers `400 INVALID_USER_ID`.
Tests: `tests/legacyUserIdRoutes.test.ts` (a `guest_*` id on every `:userId` route: `401` without sign-in, `403` signed
in, no `users` row), `tests/userFromAuth.test.ts` (no `guest_`, `allowGuestMode` or `isGuest` left in `src/`),
`tests/userResolution.test.ts`.

## 2026-10-31 — the app token reads and edits its owner's records (FT-218)

The iOS app shows the owner's records from the server, deletes them and changes their category (decision 2026-10-31,
FT-219…FT-221). Before, the token `SHORTCUT_CAPTURE_TOKEN` opened only the two capture routes.

| Was | Now |
|---|---|
| The token signed nobody in: on capture it put the owner into the body (`allowShortcutCapture`), `req.telegramUser` unset | Also on six routes, named one by one: `GET /api/transactions`, `GET /api/categories`, `GET /api/accounts` (the list only), `DELETE /api/transactions/:id`, `POST /api/transactions/:id/restore`, `PUT /api/transactions/:id`. There it signs in as `SHORTCUT_CAPTURE_OWNER` — `req.telegramUser` — and the request goes on as the owner's initData: user resolution, `verifyResourceOwnership`, the handler (`requireAuthOrAppToken`, `optionalAuthOrAppToken`, `createCurrentUserOrAppTokenMiddleware`) |
| The token's rules lived in `allowShortcutCapture` | `shortcutOwnerOrRefuse`, one function for capture and the records routes: the same answers in production (`401 INVALID_SHORTCUT_TOKEN`, `403 SHORTCUT_CAPTURE_DISABLED`, `403 ACCESS_DENIED`) and the FT-155 rules outside it. The log names the route's pattern, never the token |
| `/api/categories` and `/api/accounts` signed in with one `router.use` for every route | `GET /` of each is registered before that `router.use`, with the token-aware sign-in; every other route of theirs still goes through it, so a new route there is closed to the token by default |

A request with `X-Shortcut-Capture-Token` (even empty) or a non-blank `X-Shortcut-User-Id` goes by the token alone:
initData, the session cookie or `X-Dev-User-Id` beside it do not count. Someone else's record gets what the Mini App gets
— `403 AUTHORIZATION_ERROR`.

| Outside production, a token, no `SHORTCUT_CAPTURE_OWNER` (security review 2026-10-31) | Capture | Records routes |
|---|---|---|
| From this machine, `X-Shortcut-User-Id` names someone | for them (FT-075) | as them — like `X-Dev-User-Id` (2026-10-21) |
| Through the tunnel or the Wi-Fi, `X-Shortcut-User-Id` names someone | for them (FT-075) | `403 SHORTCUT_OWNER_REQUIRED`, after the token check: the token holder would read and edit anyone's records |

Unchanged: no other route reads the token — there it signs nobody in and the answer is that of a request without
sign-in; a capture still does not set `req.telegramUser`; `createAllowedUsersMiddleware` lets a token request on to its
route, where the owner is checked against the list; the rate limits (FT-071) — the general limiter counts a token
request by address, as one without sign-in (100 per 15 minutes).
Known and accepted (decision 2026-10-31): a leaked token now reads all the owner's records and can delete and edit them.
The API is only in the tailnet and the iOS app keeps the token in Keychain; a token kept in a Shortcut in plain text is
replaced after FT-218. `PUT` fields are not limited for the token.
Tests: `tests/appTokenRecords.test.ts` — in production the six routes as with initData, someone else's record, wrong
token, path off, `X-Dev-User-Id`, FT-184 learning, the log, the limit, and every route of `buildServer` sent with the token
only and without it: exactly the two capture routes and these six answer differently. Outside production: the FT-218
cases in `tests/localDevAuth.test.ts`.

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
first contact — it is the admin's choice; the guest branches in the same controllers are dead code until FT-136
(removed in #206).
`GET /api/transactions/analytics` and `/api/openai/usage*` had `requireAdmin` without `requireAuth` before them and so
always answered `401`; nothing called them, and FT-174 removed them with `OpenAIUsageModule`.
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
limit (20 requests / 15 minutes, shared with `/api/voice/*` until #221) — no separate limit for a non-Telegram source; behind
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
| `allowGuestMode`: a `guest_*` id went through without signing in | Same as `requireAuth`: there are no guests (Д4); the name stays until FT-136 (removed in #206) |
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
had no `requireAuth` before them and always answered `401` (closed by FT-174: removed). Not changed: the legacy user-scoped routes keep their
`:userId` paths (budgets, debts, subscription — out of the UI since Д2; the dashboard ones are removed in #205);
with the strict `verifyOwnership` they answer only their own user. FT-136 removes the guest branches that are now dead code
(removed in #206).

## Purpose

The backend supports several identity modes:

- authenticated Telegram Mini App users
- development bypass users (`X-Dev-User-Id`) in non-production
- the browser's session cookie (FT-128) and, on named routes, the Shortcut / iOS app token (FT-155, FT-218)
- legacy/raw user IDs in a few compatibility paths

Guest users (`guest_*`) are gone: decision Д4 in the browser, #206 in the backend.

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

- admin/global surfaces (the subscription grant)
- `/api/users/*` (removed in #274)
- the `:userId` routes of transactions, budgets and debts, before `verifyOwnership` (`allowGuestMode` until #206)
- voice text/voice input routes, before `writeAsSignedInUser` (removed in #221)

### `optionalAuth`

Loose auth boundary.

- If no auth header, continues unauthenticated.
- If invalid auth format, continues unauthenticated.
- If valid auth, attaches `telegramUser`.

Used for resource-scoped routes where controller fetches the resource and calls `verifyResourceOwnership(...)`, which
refuses a request without a signed-in user (`403 AUTHORIZATION_ERROR`).

Current route families:

- transaction by-id routes (`optionalAuthOrAppToken` on delete, restore and edit — FT-218)
- budget by-id routes
- debt by-id / payment routes

### `allowGuestMode` — removed in #206

Was a hybrid boundary that let `guest_*` ids through without Telegram auth; since 2026-10-21 it was `requireAuth` under
its old name. Its routes use `requireAuth` now. (The dashboard routes used it too until they were removed in #205.)

### `verifyOwnership`

Route-param/query/body ownership guard (strict since 2026-10-21, before user resolution since FT-162).

- Runs after `requireAuth` and **before** `resolveUser` / `createResolveCurrentUserMiddleware`.
- Every `userId` in the path, query and body must be the signed-in Telegram id as a non-blank string:
  someone else's id (also a UUID, a `guest_*` id, `0131184740` for `131184740`) — `403 ACCESS_DENIED`;
  a number, an array, an object, `null` or a blank string — `400 INVALID_USER_ID`.
- No `userId` at all — passes: the route takes the user from authentication.

### `verifyResourceOwnership`

Resource-scoped ownership guard.

- Fetch resource first.
- Requires `req.telegramUser` and `userModule` (the `allowGuest` option went on 2026-10-21; a record with a `guest_*`
  owner is nobody's).
- Resolves authenticated Telegram user through `GetUserUseCase`.
- Fails closed if auth/userModule/ownership cannot be verified.

Used inside:

- transaction by-id operations
- budget by-id operations
- debt by-id/payment operations

### `createUserResolutionMiddleware`

User ID normalization boundary.

- Extracts user ID from params/query/body.
- UUID passes through, in lower case (#230).
- A Telegram id resolves through `resolveUserIdToUUID(...)`.
- Missing userId usually skips by default (`skipIfNoUserId=true`).
- A userId that is not a non-blank string (FT-162), or a string that is no UUID and no Telegram id — `guest_*`, `abc`,
  `-5`, a number from 2^53 on (#224, #230, `resolvableUserIdOf`) — `400 INVALID_USER_ID`, not a resolver error;
  nothing is resolved or created.
- Resolver errors map to `USER_RESOLUTION_ERROR` in this middleware.
- Creates the user for a Telegram id it does not know (`GetOrCreateUserUseCase`), so on user routes it runs only
  after `verifyOwnership` (FT-162). Only the admin grant uses it for an id other than the signed-in user's.

### `resolveUserIdToUUID`

Current loose resolver helper.

- Rejects empty/whitespace-only IDs.
- Rejects an id that is no UUID and no Telegram id (a positive whole number in digits) with a `ValidationError`
  before the user module is asked, so it creates no user (#224). `resolveUserIdToUUIDStrict` does the same.
- Passes through UUIDs, in lower case since #230 (and `guest_*` ids until #206).
- Reads a Telegram id by `telegramIdOf` (#230), as `ALLOWED_TELEGRAM_IDS` does: below 2^53, leading zeros name the same
  user; resolves it to UUID through `GetOrCreateUserUseCase`, creating the user without the zeros on first contact.
- On resolver failure, logs and returns the Telegram id (without leading zeros) for backward compatibility.

FT-017D decision: do not globally change this helper to fail-closed yet.

## Route Boundary Matrix

| Route family | Route style | Auth middleware | User resolution | Ownership check | Strictness |
|---|---|---|---|---|---|
| Health | global | none | none | none | open |
| User routes — removed in #274 | `GET /api/users/:telegramId`, `POST /api/users`, `PUT /api/users/:id` | — (`404`) | — | — | — |
| Settings | `GET`, `PATCH /api/settings` | `requireAuth` | signed-in user (`createCurrentUserMiddleware`) | none — no userId taken; an unknown field (`userId`, `timezone`) is `400` | strict |
| Transaction history, totals, frequent | `GET /api/transactions` (FT-107), `/totals`, `/frequent` | `requireAuth` (`GET /` also the app token, FT-218) | signed-in user (`createCurrentUserMiddleware`) | none — no userId taken | strict |
| Transaction create | `POST /api/transactions` | `requireAuth` | signed-in user (`createResolveCurrentUserMiddleware`) | `verifyOwnership` on a body/query userId, before resolution (FT-162) | strict |
| Transaction user-scoped analytics/list | `/api/transactions/.../:userId` | `requireAuth` (`allowGuestMode` until #206) | route middleware, after the check (FT-162) | `verifyOwnership` | strict |
| Transaction by-id CRUD/archive | `/api/transactions/:id` | `optionalAuth`; delete, restore, edit `optionalAuthOrAppToken` (FT-218) | controller/helper | `verifyResourceOwnership` | resource-strict |
| Voice text-input and upload — removed in #221 | `/api/voice/text-input`, `/api/voice/voice-input` | — (`404`) | — | — | — |
| Quick capture | `POST /api/quick-capture`, `/payment` | `allowShortcutCapture`: `requireAuth` + `writeAsSignedInUser`, or the Shortcut token (FT-155) | controller resolver | signed-in user or `SHORTCUT_CAPTURE_OWNER` | strict |
| Budgets — removed in #264 | `/api/budgets/users/:userId/...`, `/api/budgets/:budgetId...` | — (`404`) | — | — | — |
| Debts — removed in #265 | `/api/debts/user/:userId...`, `/api/debts/:debtId...`, `/api/debts/payments/:paymentId` | — (`404`) | — | — | — |
| Dashboard — removed in #205 | `/api/dashboard/:userId...` | — (`404`) | — | — | — |
| Subscription (own) | `GET /api/subscription/:userId`, `POST /check-limit`, `/cancel`, `/start-trial` | `requireAuth` | signed-in user (`createResolveCurrentUserMiddleware`, FT-162) | `verifyOwnership` on any path/body/query userId, before resolution | strict |
| Subscription grant | `POST /api/subscription/grant` | `requireAuth` + `requireAdmin` | body userId (the admin's target; a non-string or an id that is no UUID and no Telegram id is `400 INVALID_USER_ID`, #224; a Telegram id with leading zeros is the same user, a UUID no user has is `404 NOT_FOUND`, #230) | admin only | strict/admin |

The column «Guest allowed» went with the guests (#206). A request without sign-in reaches only these routes:

- `GET /api/health`.
- The web login through the bot (FT-128): `POST`, `GET` and `DELETE /api/auth/web-login`, `POST` and
  `DELETE /api/auth/session` — they start, wait for, cancel a login by its one-time token and open or close the
  browser's session; a session opens only after the owner confirmed the login in the bot. `GET /api/auth/session`
  needs sign-in.
- The by-id routes on `optionalAuth` (`optionalAuthOrAppToken` for delete, restore and edit of a record, FT-218):
  `/api/transactions/:id` and its `/restore`, `/archive`, `/unarchive`, `POST /api/transactions/archive/batch`.
  The controller looks
  the record up and its owner check answers a request without sign-in `403 AUTHORIZATION_ERROR`.
- Quick capture (`POST /api/quick-capture`, `/payment`) and the six FT-218 routes with the Shortcut token, which signs
  in as `SHORTCUT_CAPTURE_OWNER` instead of Telegram.

## Strict vs Loose Recommendations

### Keep loose for now

Keep current compatibility behavior for:

- Telegram bot text/voice handlers
- Telegram stats/today/budget commands
- backward-compatible voice text-input behavior until product policy changes (moot: removed in #221)

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

This is intentional for resource-scoped routes, but surprising:

- invalid auth format continues unauthenticated
- controller then rejects the request via ownership (`403 AUTHORIZATION_ERROR`, not `401`); guest-owned resources
  were opened here until 2026-10-21

Recommendation: keep for now, but test any route where invalid auth should fail immediately.

### B2 — `allowGuestMode` is central to user-scoped route safety

Routes using `allowGuestMode + verifyOwnership` are only as clear as their userId extraction and guest detection.

Recommendation: maintain route tests around guest/non-guest behavior for any modified route family.

Closed in #206: the user-scoped routes use `requireAuth + verifyOwnership`; `tests/legacyUserIdRoutes.test.ts` checks a
`guest_*` id on every one of them.

### B3 — Subscription behavior remains policy-dependent

Subscription middleware currently has explicit fail-open behavior when user UUID cannot be resolved.

Do not change without product/security decision.

### B4 — Voice input compatibility remains policy-dependent

`voiceProcessingController` still supports compatibility behavior around userId input. Do not change without product decision and route tests.

Moot: the controller and its routes are gone (#221).

## Recommended Next Tasks

### FT-024A — Add strict resolver helper without migrating routes

Status: done.

Implemented:

- Added `resolveUserIdToUUIDStrict(...)`.
- Kept `resolveUserIdToUUID(...)` fail-open behavior unchanged.
- Added focused tests for UUID/guest passthrough (the guest passthrough removed in #206), telegramId resolution, empty-id validation, and fail-closed resolver errors.
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
- voice text-input missing userId behavior (moot: removed in #221)
- guest access policy for debt/budget/transaction resources (closed: no guests, Д4 and #206)
- production auth behavior
