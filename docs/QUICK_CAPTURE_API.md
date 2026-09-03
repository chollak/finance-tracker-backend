# Quick Capture API

> **Status:** describes the **shipped** implementation as of 2026-09-02 (commits `50d84ef` → `03a39a3`).
> This document is derived from the code and tests listed under [Source of truth](#source-of-truth), **not** from the
> earlier speculative spec in `.hermes/plans/2026-09-02_130400-api-first-quick-actions-spec.md`. Where the old spec and
> the shipped contract disagree, the shipped contract wins; the differences are listed in
> [Planned but not implemented](#planned-but-not-implemented).

Quick Capture is the shared application boundary that turns one line of natural-language text into saved
transactions/debts and a ready-to-render acknowledgement. It is a thin wrapper around the existing text pipeline
(`ProcessTextInputUseCase`) — parsing, the conservative transfer/savings/withdrawal safeguards and persistence all stay
inside that use case.

---

## Endpoint

```http
POST /api/quick-capture
Content-Type: application/json
```

Mounting: `buildServer()` mounts the router at `/quick-capture`
(`src/delivery/web/express/expressServer.ts`), and `src/index.ts` mounts `buildServer()` under `/api`, so the public
path is `POST /api/quick-capture`. The router is only registered when a `QuickCaptureModule` is passed to
`buildServer()`; `createModules()` always creates one, so the route is present in the normal app.

There is exactly **one** Quick Capture route. There is no `GET`, no parse/commit split, and no per-transaction
sub-resource.

---

## Auth

The route uses `allowGuestMode` (`src/delivery/web/express/middleware/authMiddleware.ts`):

| Caller | Requirement |
|---|---|
| `userId` starts with `guest_` | No auth header needed. `req.isAuthenticated = false`, request proceeds. |
| Any other `userId` | Full `requireAuth`: `Authorization: tma <initData>` (Telegram Mini App initData, HMAC-validated, max age 1 hour). |
| Local dev only (`NODE_ENV !== 'production'`) | `X-Dev-User-Id: <telegramId>` header bypasses auth. |

Notes:

- `allowGuestMode` reads `req.body.userId`, so the guest check happens **before** the handler's own validation. A
  non-guest request with no auth header gets `401` even if `text` is missing.
- There is **no** production API token, no per-user Shortcut token, and no API-key auth. An iPhone Shortcut cannot call
  this endpoint directly today unless it can produce valid Telegram `initData` or the server runs in non-production mode
  with `X-Dev-User-Id`. Phase I of the plan (`docs`-level: token auth for Shortcuts) is not implemented.
- The route does **not** apply `verifyOwnership`. Ownership is effectively enforced by `requireAuth` for non-guest ids,
  not by comparing `userId` against the authenticated Telegram user.

### User id resolution

When a `UserModule` is wired (it is, in `buildServer`), `userId` goes through
`resolveUserIdToUUID()` (`src/shared/application/helpers/userIdResolver.ts`):

- `guest_*` → passed through unchanged
- UUID v4 → passed through unchanged
- anything else (e.g. a numeric Telegram id) → resolved/created into a user UUID
- resolution failure is **fail-open**: the raw string is used as the owner id

---

## Rate limiting

`aiRateLimiter` is applied to the whole router: **20 requests per 15 minutes, keyed by IP**, responding `429` with
`{"success": false, "error": "...", "code": "AI_RATE_LIMIT_EXCEEDED"}`.

Caveat: `aiRateLimiter` is a **single shared middleware instance**, also used by
`src/modules/voiceProcessing/presentation/controllers/voiceProcessingController.ts`. The 20-request budget is therefore
shared between `/api/voice/*` and `/api/quick-capture` for the same IP — it is not 20 per endpoint. It is also per-IP,
not per-user, so several users behind one NAT/tunnel share one budget. The limiter runs **before** auth and validation,
so even rejected requests consume budget.

---

## Request

```json
{
  "text": "такси 18к",
  "userId": "guest_abc123",
  "userName": "Shukur",
  "source": "miniapp"
}
```

| Field | Type | Required | Behavior |
|---|---|---|---|
| `text` | `string` | yes | Must be a non-empty string with non-whitespace content. Max **2000 characters** (checked on the raw string, before trimming). Trimmed before parsing; the trimmed value is echoed back as `data.text`. |
| `userId` | `string` | yes | Owner of the created transactions. No default — unlike the older `POST /api/voice/text-input` route, this endpoint never falls back to a placeholder user id. |
| `userName` | `string` | no | Passed to the parser/user pipeline. A non-string value is silently treated as absent. |
| `source` | `"telegram" \| "miniapp" \| "ios_shortcut"` | no | Routing metadata only. Validated against the enum, echoed back in the response. **Not persisted.** |

Unknown extra fields are ignored (the handler destructures only the four fields above).

Validation order inside the handler: `text` present/non-blank → `text` length → `source` enum → `userId` present.

---

## Response

Success responses use the shared controller envelope from
`src/shared/infrastructure/utils/controllerHelpers.ts` — the Quick Capture payload is under `data`:

```json
{
  "success": true,
  "data": { "...QuickCaptureResult..." },
  "message": "Quick capture processed",
  "timestamp": "2026-09-02T16:24:23.000Z"
}
```

HTTP status on success is always `200` (including `no_transaction` — nothing was parsed, but the request itself
succeeded).

### `data` — `QuickCaptureResult`

| Field | Type | Notes |
|---|---|---|
| `status` | `"saved" \| "needs_review" \| "no_transaction"` | See table below. |
| `text` | `string` | The trimmed input text, echoed back. |
| `source` | `CaptureSource` \| absent | Echoed from the request; the key is omitted from JSON when no source was sent. |
| `transactions` | `CapturedTransaction[]` | Transactions the pipeline **already persisted**. May be empty. |
| `debts` | `CapturedDebt[]` | Debts the pipeline **already persisted**. May be empty. |
| `ack` | `CaptureAck` | Ready-to-render confirmation (Russian), shared by all clients. |
| `review` | `CaptureReview` | Machine-readable reasons the capture may need attention. |

### `status`

| Status | When |
|---|---|
| `saved` | At least one transaction was created and none is flagged `needsReview`. |
| `needs_review` | At least one created transaction has `needsReview: true`, **or** no transaction was created but one or more debts were (a debt-only capture did write something, so it is not "nothing found"). |
| `no_transaction` | Nothing was parsed: no transactions and no debts. |

**There is no `draft` status.** There is no parse-without-save path, so a status the code cannot produce is deliberately
absent from the type union (`src/modules/quickCapture/domain/quickCaptureTypes.ts`). There is also no `error` status —
failures are transport-level HTTP errors (see [Errors](#errors)), never a `200` body with `status: "error"`.

Everything in `transactions`/`debts` is **already written to the database** by the time the response is sent. A
`needs_review` result is a request to correct a saved row, not a pending draft awaiting confirmation.

### `CapturedTransaction`

| Field | Type | Notes |
|---|---|---|
| `id` | `string` | Persisted transaction id. |
| `amount` | `number` | Always positive; direction is in `type`. |
| `type` | `"income" \| "expense"` | |
| `semanticType` | `TransactionSemanticType` | e.g. `expense`, `income`, `own_transfer`, `saving_deposit`, `cash_withdrawal`. Normalized from `type` when the parser did not set one. |
| `category` | `string` | Category **id** (`"transport"`, `"food"`), not a display name. |
| `description` | `string?` | |
| `merchant` | `string?` | |
| `date` | `string` | As produced by the parser: `YYYY-MM-DD` or a full ISO timestamp. |
| `confidence` | `number?` | 0–1, when the parser provided one. |
| `needsReview` | `boolean` | Always a real boolean (missing → `false`). |
| `countsAsRealExpense` | `boolean` | Mirrors `countsAsRealExpense(semanticType)` so clients never re-derive transfer/savings semantics. `false` for income, own transfers, savings deposits and cash withdrawals. |

### `CapturedDebt`

Alias of `DetectedDebt` (`src/modules/voiceProcessing/domain/processedTransaction.ts`), so the two shapes cannot drift:

| Field | Type |
|---|---|
| `id` | `string` |
| `debtType` | `"i_owe" \| "owed_to_me"` |
| `personName` | `string` |
| `amount` | `number` |
| `dueDate` | `string \| null`, optional |
| `description` | `string?` |
| `confidence` | `number?` |
| `linkedTransactionId` | `string?` |

### `ack`

Pure formatter (`src/modules/quickCapture/application/buildCaptureAck.ts`), shared by the HTTP response and the Telegram
bot so both channels confirm a capture with the same words. Russian, currency rendered as `сум` with space-grouped
thousands.

| Field | Type | Notes |
|---|---|---|
| `title` | `string` | `Записал` · `Нужно проверить` · `Записал N` · `Записал N · M к проверке` · `Записал долг` · `Не нашёл операцию` |
| `summary` | `string` | Single capture: `Label · Amount сум · Category` (category dropped when it duplicates the label). Multi-capture: one `Label · Amount сум` line per transaction, newline-joined. |
| `details` | `string?` | Single capture only: `Сегодня` or the calendar day, plus `· Не входит в расходы` when the transaction is not a real expense (transfers/savings/withdrawals; not shown for plain income). |
| `actions` | `("edit" \| "delete" \| "review")[]` | `["edit","delete"]` normally, `["edit","delete","review"]` when something needs review, `["review"]` for a debt-only capture, `[]` when nothing was found. |

`actions` are hints for the client UI; this endpoint does not implement them — edit/delete go through the existing
transaction routes.

### `review`

```json
{ "reasons": ["transaction_needs_review", "debt_detected"] }
```

`reasons: []` when there is nothing to check. `transaction_needs_review` — at least one created transaction is flagged.
`debt_detected` — at least one debt was created (debts always warrant a look, even alongside saved transactions).

---

## Errors

Validation and server errors use the nested envelope from `handleControllerError`:

```json
{
  "success": false,
  "error": { "code": "VALIDATION_ERROR", "message": "Text is required and cannot be empty", "timestamp": "..." }
}
```

Auth and rate-limit middleware answer earlier in the chain and use a **flat** shape
(`{ "success": false, "error": "<message>", "code": "<CODE>" }`). Clients must handle both.

| Status | `code` | Cause |
|---|---|---|
| 400 | `VALIDATION_ERROR` | `Text is required and cannot be empty` — `text` missing, not a string, or whitespace-only |
| 400 | `VALIDATION_ERROR` | `Text is too long (maximum 2000 characters)` |
| 400 | `VALIDATION_ERROR` | `Source must be one of: telegram, miniapp, ios_shortcut` |
| 400 | `VALIDATION_ERROR` | `User ID is required` — `userId` missing or not a string |
| 400 | `INVALID_JSON` | Malformed JSON body (global error handler) |
| 401 | `MISSING_AUTH_HEADER` | Non-guest `userId` with no `Authorization` header |
| 401 | `INVALID_AUTH_FORMAT` | `Authorization` header not in `tma <initData>` form |
| 401 | `INVALID_AUTH` | initData hash mismatch or older than 1 hour |
| 401 | `MISSING_USER_DATA` | Valid initData without a `user` payload |
| 429 | `AI_RATE_LIMIT_EXCEEDED` | Shared AI rate limit exhausted for the IP |
| 500 | `AUTH_NOT_CONFIGURED` | `TG_BOT_API_KEY` missing while validating a non-guest request |
| 500 | `INTERNAL_ERROR` | Parser/persistence failure. The underlying error message is **not** leaked to the client. |

Validation failures never reach the service, so they cost no OpenAI call and write nothing.

---

## Examples

### Guest capture (local dev)

```bash
curl -sS -X POST http://localhost:3000/api/quick-capture \
  -H 'Content-Type: application/json' \
  -d '{"text":"такси 18к","userId":"guest_abc123","source":"miniapp"}'
```

```json
{
  "success": true,
  "data": {
    "status": "saved",
    "text": "такси 18к",
    "source": "miniapp",
    "transactions": [
      {
        "id": "tx-1",
        "amount": 18000,
        "type": "expense",
        "semanticType": "expense",
        "category": "transport",
        "description": "такси",
        "merchant": "такси",
        "date": "2026-09-02",
        "confidence": 1,
        "needsReview": false,
        "countsAsRealExpense": true
      }
    ],
    "debts": [],
    "ack": {
      "title": "Записал",
      "summary": "Такси · 18 000 сум · Транспорт",
      "details": "Сегодня",
      "actions": ["edit", "delete"]
    },
    "review": { "reasons": [] }
  },
  "message": "Quick capture processed",
  "timestamp": "2026-09-02T16:24:23.000Z"
}
```

### Authenticated Mini App capture

```bash
curl -sS -X POST https://<tunnel-host>/api/quick-capture \
  -H 'Content-Type: application/json' \
  -H "Authorization: tma $TELEGRAM_INIT_DATA" \
  -d '{"text":"кофе 35000","userId":"597843119","userName":"Shukur","source":"miniapp"}'
```

### Needs review

```json
{
  "status": "needs_review",
  "text": "перевел 500к",
  "transactions": [{ "id": "tx-review", "needsReview": true, "...": "..." }],
  "debts": [],
  "ack": { "title": "Нужно проверить", "summary": "Перевел · 500 000 сум", "details": "Сегодня", "actions": ["edit", "delete", "review"] },
  "review": { "reasons": ["transaction_needs_review"] }
}
```

### Nothing recognized

```json
{
  "status": "no_transaction",
  "text": "привет",
  "transactions": [],
  "debts": [],
  "ack": { "title": "Не нашёл операцию", "summary": "Не удалось распознать сумму или операцию", "actions": [] },
  "review": { "reasons": [] }
}
```

---

## Telegram uses the same boundary

- **Text messages** (`createTextMessageHandler`, `src/delivery/messaging/telegram/handlers/messageHandlers.ts`) call
  `quickCaptureModule.getQuickCaptureService().capture({ text, userId, userName, source: 'telegram' })` — the exact same
  service the HTTP route calls. Telegram is a client of the boundary, not a parallel implementation.
- **Voice messages** still go through `ProcessVoiceInputUseCase` (download → transcription → parse); `capture()` takes
  text only. The result is then mapped with `toCapturedTransaction()` and formatted with `buildCaptureAck()`, so a voice
  confirmation reads exactly like a text one apart from the 🎤 prefix. Voice does **not** produce a
  `QuickCaptureResult` and never sets a `source`.
- The bot sends one message per captured transaction so each keeps its own edit/delete keyboard, and renders the ack via
  `formatCaptureMessage()`.
- Telegram keeps a separate, older confidence gate: `confidence < 0.6` switches to the confirmation keyboard. That is a
  bot-side UX rule and is independent of the contract's `needsReview` / `status`.

---

## Current limitations

1. **`source` is not persisted.** It is validated and echoed back for client-side routing only — the `Transaction`
   entity has no source column, so you cannot query "everything captured from the Mini App".
2. **No parse-without-save / draft.** Every successful capture writes immediately. There is no
   `/parse` + `/commit` split and no `draft` status; a client confirmation sheet would have to edit or delete an
   already-saved row.
3. **No idempotency.** `clientRequestId` is not accepted and no deduplication exists — a retried request creates
   duplicate transactions.
4. **Rate limit is coarse.** The AI limiter is per-IP and its 20/15min budget is *shared* with `/api/voice/*`; it is not
   per-user and cannot be tuned separately for capture.
5. **No `occurredAt`.** The transaction date comes from the parser/server, so a client cannot backdate a capture through
   this endpoint.
6. **The Mini App Home quick-capture card calls this endpoint.** Authenticated Telegram Mini App users submit
   one-line captures through `POST /api/quick-capture`; guest mode keeps data in browser-local IndexedDB, so
   server-side quick capture is intentionally disabled for guests.
7. **No Shortcut/token auth.** See [Auth](#auth) — direct iPhone Shortcut use requires the deferred token decision.
8. **Blank-text guard exists in two places.** The route rejects blank text with `400`; the service additionally
   short-circuits blank input to `no_transaction` without calling the parser. The service-level path is only reachable
   by in-process callers such as the Telegram handler.

## Planned but not implemented

Referenced in the earlier plans/spec, absent from the shipped contract:

| Item | Where it was proposed | Status |
|---|---|---|
| `occurredAt` request field | `.hermes/plans/2026-09-02_130400-api-first-quick-actions-spec.md` §5.2 | Not implemented; ignored if sent. |
| `clientRequestId` idempotency key | same, §5.2 | Not implemented; ignored if sent. |
| `draft` status + `POST /api/quick-actions/parse` / `/commit` | same, §5.3 | Not implemented. |
| `error` status in the response body | same, §5.2 | Not implemented — errors are HTTP status codes. |
| Singular `transaction` field | same, §5.2 | Shipped as the array `transactions` (multi-item input is supported). |
| `change_category` ack action | same, §5.2 | Not implemented; actions are `edit` / `delete` / `review`. |
| Per-user Shortcut token auth | implementation plan, Phase I | Deferred pending an explicit auth/security decision. |

---

## Source of truth

Read these before changing the contract:

- `src/modules/quickCapture/domain/quickCaptureTypes.ts` — the contract types
- `src/modules/quickCapture/application/quickCaptureService.ts` — status resolution
- `src/modules/quickCapture/application/buildCaptureAck.ts` — ack wording
- `src/modules/quickCapture/application/toCapturedTransaction.ts` — shared transaction mapping (also used by voice)
- `src/modules/quickCapture/presentation/controllers/quickCaptureController.ts` — HTTP validation, auth, rate limit
- `src/delivery/web/express/expressServer.ts` + `src/index.ts` — mount path
- `src/delivery/messaging/telegram/handlers/messageHandlers.ts` — Telegram as a client

Tests that pin this behavior:

- `tests/quickCaptureRoutes.test.ts` — HTTP validation, auth, envelope, error mapping
- `tests/quickCaptureService.test.ts` — status resolution, semantic safeguards, multi-item, debts
- `tests/buildCaptureAck.test.ts` — ack wording
- `tests/telegramMessageHandlers.test.ts` — Telegram routing through the boundary
