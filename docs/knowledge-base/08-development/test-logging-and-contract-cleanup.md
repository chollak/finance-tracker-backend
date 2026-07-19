# Test Logging and Error Contract Cleanup Plan

> Status: backlog plan. This document records findings from FT-014 and defines safe follow-up work. It intentionally does **not** change production behavior.

## Context

FT-014 added safety tests for:

- Debt module
- Subscription / limits / trial behavior
- User resolution / guest behavior
- Critical API route / middleware behavior

The safety net is now strong enough to support intentional behavior changes, but the work surfaced several current contracts and test-environment issues that should be handled deliberately rather than fixed ad hoc.

Current verification baseline:

```text
npm run verify
12 suites / 141 tests passing
```

## Findings

### 1. Test output is noisy

Expected error-path tests currently print lots of logs, including:

- environment load messages
- request logs from Express middleware
- expected controller/global error logs
- expected fail-open resolver logs
- existing OpenAI/transaction/learning test logs

This does not fail tests, but it makes verification harder to scan and can hide real failures.

Observed examples:

```text
Environment variables loaded from .env
[HTTP] Express error handler ...
[USER] Failed to resolve userId ... db unavailable
[OPENAI] Failed to create transaction { error: 'DB error' }
```

### 2. `GetUserUseCase` not-found contract is `success(null)`

Current behavior:

```ts
success: true
 data: null
```

This may be acceptable for a query use case, but it should be explicit across controllers and docs. If API routes expect not-found as an error, this should be normalized.

### 3. `UpdateUserUseCase` missing-user contract throws

Current behavior:

```text
User not found after update
```

It throws instead of returning `Result.failure(...)`. This is inconsistent with many other use cases.

### 4. `resolveUserIdToUUID` fails open

Current behavior when telegramId → UUID resolution throws:

```ts
return originalUserId;
```

This preserves backward compatibility, but it is a security/consistency-sensitive contract because downstream filtering/ownership may depend on UUID normalization.

### 5. `resolveUserIdToUUID('')` attempts user creation

Current empty-string behavior:

```ts
getOrCreate({ telegramId: '' })
```

The helper does not validate empty input. This can create odd user records if upstream validation is missed.

### 6. `notFoundHandler` reports `/` for wildcard-mounted routes

Current API 404 response for an unmatched path like `/api/does-not-exist` contains:

```text
Route GET / not found
```

because `router.use('*', notFoundHandler)` rewrites the path visible to the handler.

Status and shape are correct (`404`, `NOT_FOUND`), but the message is inaccurate.

## Recommended Follow-up Work

### FT-017A — Quiet test logging

Status: done.

Goal: make expected-error tests easier to read without hiding real test failures.

Implemented approach:

1. Winston infrastructure logger is silent when `NODE_ENV === 'test'` unless `TEST_LOGS=true`.
2. Application-layer fallback logger is silent under the same test-only condition.
3. `AppConfig` env-file load messages are suppressed under the same test-only condition.
4. Explicit test assertions for error responses remain unchanged.
5. Unexpected Jest assertion/runtime failures are not silenced.

Definition of Done:

- [x] `npm run verify` output is substantially quieter.
- [x] All tests still pass.
- [x] No production logging behavior changes.
- [x] Developers can opt back into test logs with `TEST_LOGS=true`.

Risk: low.

### FT-017B — Decide user query not-found convention

Goal: decide whether read/query use cases return `success(null)` or `failure(NotFoundError)`.

Recommended decision options:

- Keep `success(null)` for query use cases, document it, and ensure controllers map null correctly.
- Normalize to `failure(NotFoundError)` and update controllers/tests together.

Definition of Done:

- Decision recorded.
- Tests updated only if behavior changes intentionally.

Risk: medium because API response contracts may change.

### FT-017C — Normalize `UpdateUserUseCase` error handling

Status: done.

Goal: make missing-user behavior consistent with the project Result pattern.

Caller audit:

- `userController` is the only direct HTTP caller found.
- Controller already verifies the user exists before update, so this is mostly a defensive consistency change.
- `updateLastSeen()` remains unchanged because it is a side-effect helper, not a Result-returning command endpoint.

Implemented behavior:

- `UpdateUserUseCase.execute(...)` now returns `Result<User>`.
- Repository update exceptions are normalized into `Result.failure(error)`.
- `userController` unwraps the Result and throws `userResult.error` into existing controller error handling.
- `tests/userResolution.test.ts` verifies Result success/failure instead of raw user / thrown promise rejection.

Definition of Done:

- [x] Behavior is explicitly documented.
- [x] Code/tests were updated together using RED → GREEN.
- [x] No uncaught controller path introduced.

Risk: medium-low after caller audit.

### FT-017D — Decide resolver fail-open vs fail-closed

Goal: decide whether `resolveUserIdToUUID` should return original ID on resolver failure.

Options:

- Keep fail-open for backward compatibility.
- Fail-closed for security-sensitive flows and handle errors explicitly.
- Split APIs:
  - `resolveUserIdToUUIDLoose(...)`
  - `resolveUserIdToUUIDStrict(...)`

Recommended future direction: strict behavior for ownership/security-sensitive API paths, loose behavior only where backward compatibility is explicitly needed.

Risk: high if changed globally without auditing callers.

### FT-017E — Validate empty userId early

Status: done.

Goal: prevent empty IDs from reaching user creation/resolution.

Caller audit:

- Telegram handlers pass `ctx.from.id.toString()`, so empty IDs should not occur in normal Telegram flows.
- API and helper callers still benefit from resolver-level validation because empty IDs are never valid identifiers.
- `tryResolveUserIdSync('')` remains `null`, because it only reports whether a value can be resolved synchronously.

Implemented approach:

- `resolveUserIdToUUID()` trims input and throws `ValidationError('userId is required', 'userId')` for empty/whitespace-only IDs.
- Validation happens before guest/UUID/telegram resolution.
- Empty input can no longer reach `getOrCreate({ telegramId: '' })`.

Definition of Done:

- [x] Empty string cannot create a user.
- [x] Tests cover resolver behavior.

Risk: medium-low after caller audit.

### FT-017F — Fix API 404 path message

Status: done.

Goal: preserve 404 status/shape but report the actual unmatched path.

Implemented approach:

- `notFoundHandler` now uses `req.originalUrl || req.url || req.path`, so wildcard-mounted middleware still reports the actual original request URL.
- API route test now expects `/api/does-not-exist` in the 404 message.

Definition of Done:

- [x] Unknown route response reports useful path.
- [x] API route tests updated intentionally.

Risk: low.

## Recommended Order

1. ✅ FT-017A — quiet test logging
2. ✅ FT-017F — fix 404 path message
3. ✅ FT-017C — normalize `UpdateUserUseCase` Result contract
4. ✅ FT-017E — empty userId validation
5. ✅ FT-017B — normalize `GetUserUseCase` not-found convention
6. FT-017D — resolver fail-open/fail-closed decision

Reasoning:

- Logging and 404 message are low-risk hygiene.
- User/ownership resolver behavior is security-sensitive and should be changed only after caller audit.

## Non-Goals

This plan does not:

- change production code
- change API contracts
- add/remove tests
- silence logs immediately
- implement any scheduler/background automation

## Guidance for Future Work

When implementing any FT-017 subtask:

1. Start with the existing characterization tests.
2. If behavior changes intentionally, update tests in the same commit.
3. Run:

```bash
npm run verify
```

4. Document the changed contract in `TASKS.md` and `AUTONOMOUS_REPORT.md`.
