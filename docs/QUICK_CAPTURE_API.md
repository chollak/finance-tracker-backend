# Quick Capture API

> **Status:** describes the **shipped** implementation as of 2026-09-04 (commits `50d84ef` → `03a39a3`), plus the
> iOS Shortcut token from `FT-075`, bound to one owner and allowed in production since `FT-155` (2026-10-27), and the
> time of input `capturedAt` from `FT-175` (2026-10-29).
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

The route uses `allowShortcutCapture` (`src/delivery/web/express/middleware/authMiddleware.ts`): a Shortcut request
goes by its token, anything else through `requireAuth` and `writeAsSignedInUser`. Before both,
`createAllowedUsersMiddleware` in `buildServer` refuses a signed-in user who is not in `ALLOWED_TELEGRAM_IDS`
(`403 ACCESS_NOT_ALLOWED`, FT-153).

| Caller | Requirement |
|---|---|
| Mini App and browser (no guests since Д4, 2026-10-21) | Full `requireAuth`: `Authorization: tma <initData>` (Telegram Mini App initData, HMAC-validated, max age 1 hour) or the browser session (FT-128). The capture is for the **signed-in user**: a body `userId` may be omitted; if sent, it must be that user's Telegram id, otherwise **`403 ACCESS_DENIED`**. |
| Local dev only (`NODE_ENV !== 'production'`) | `X-Dev-User-Id: <telegramId>` header bypasses auth — only for a request from this machine (loopback, no `Cf-Connecting-Ip` / `X-Forwarded-For` / `Forwarded`): never through the `dev:miniapp` tunnel or from the network (`isLocalRequest`, 2026-10-21). |
| iPhone Shortcut (production too) | `X-Shortcut-Capture-Token: <SHORTCUT_CAPTURE_TOKEN>`; the capture is for `SHORTCUT_CAPTURE_OWNER`. See [below](#ios-shortcut-capture). |

Notes:

- Authentication runs **before** the handler's own validation: a request that does not sign in gets `401` even if
  `text` is missing.
- In production the way in is valid Telegram `initData`, the browser session, or the Shortcut's capture token, which
  writes only for its owner (FT-155). There is no other API key.
- Closed access (FT-153): with `ALLOWED_TELEGRAM_IDS` set, a request signed in as anyone else gets **`403
  ACCESS_NOT_ALLOWED`** before the route, and the Shortcut owner must be on the list.
- The owner is the signed-in user (`writeAsSignedInUser`, 2026-10-21): a body `userId` naming anyone else is `403
  ACCESS_DENIED`. Before that the route wrote for whatever `userId` the body named.

### iOS Shortcut capture

An iPhone Shortcut cannot produce Telegram initData, so it proves itself with a capture token bound to one owner
(`allowShortcutCapture`, `src/delivery/web/express/middleware/authMiddleware.ts`; FT-075, owner binding and production
since FT-155, decision 2026-10-26). It works on the live instance with `NODE_ENV=production`, which the API is reachable
on only inside the tailnet.

| Setting | Meaning |
|---|---|
| `SHORTCUT_CAPTURE_TOKEN` | The shared capture token. In production at least **32 characters** (`openssl rand -hex 32`). |
| `SHORTCUT_CAPTURE_OWNER` | The Telegram user id every capture by the token is written for. Must be in `ALLOWED_TELEGRAM_IDS` (FT-153). Compared as a number, like the list: `0900000143` is `900000143`. |

| Header | Required | Meaning |
|---|---|---|
| `X-Shortcut-Capture-Token` | in production always; outside production when `SHORTCUT_CAPTURE_TOKEN` is set | Must equal `SHORTCUT_CAPTURE_TOKEN`, compared in constant time (SHA-256 of both, then `timingSafeEqual`). |
| `X-Shortcut-User-Id` | no, once `SHORTCUT_CAPTURE_OWNER` is set | If sent, must name the owner, else **`403 ACCESS_DENIED`**: the token holder cannot choose whom to write for. Outside production without an owner it names the owner, as before FT-155. |

A request is a Shortcut request when it carries `X-Shortcut-Capture-Token` (even empty) or a non-blank
`X-Shortcut-User-Id`. Then, in this order:

1. The path is off → **`403 SHORTCUT_CAPTURE_DISABLED`**. In production it is on only with a token of 32+ characters
   and an owner on `ALLOWED_TELEGRAM_IDS`; with neither set the Shortcut is simply off. A half or wrong setting (short
   token, one without the other, an owner that is not an id or not on the list) **stops the start**
   (`AppConfig.validate`), so it shows up when the server is restarted, not later on the phone. Refused loudly, never
   silently ignored, so a misconfigured Shortcut cannot fall through to another auth path.
2. Outside production, no token configured and the request is not from this machine (the tunnel, the Wi-Fi) →
   **`403 SHORTCUT_CAPTURE_TOKEN_REQUIRED`** (2026-10-21). In production the token is always configured.
3. The token header is missing, empty or wrong → **`401 INVALID_SHORTCUT_TOKEN`**. Checked before anything about the
   owner, so an answer to a wrong token tells nothing about the owner or the list.
4. `X-Shortcut-User-Id` names someone else (or is not a Telegram id) → **`403 ACCESS_DENIED`**. Outside production with
   neither an owner nor the header → **`403 SHORTCUT_OWNER_REQUIRED`**.
5. The owner is not in `ALLOWED_TELEGRAM_IDS` → **`403 ACCESS_NOT_ALLOWED`** (FT-153; in production the start already
   refused such an owner).
6. Otherwise `req.body.userId` is **overridden** with the owner and `req.body.source` is **forced** to `ios_shortcut`, so
   the Shortcut body only has to carry `text` (and, best, a `clientId`). A `userId`/`source` in the body is ignored.

A request with neither header changes nothing: it signs in through `requireAuth` exactly as before, so the Mini App path
is unaffected. `X-Dev-User-Id` never counts in production, also not next to a Shortcut token: the record is the owner's.

`req.telegramUser` is deliberately **not** fabricated for shortcut requests — the token proves nothing about a Telegram
session, so `verifyOwnership`/`requireAdmin` stay fail-closed if they are ever added to this route.

```bash
# the live instance, from a device in the tailnet
curl -sS -X POST https://<pc>.<tailnet>.ts.net/api/quick-capture \
  -H 'Content-Type: application/json' \
  -H 'X-Shortcut-Capture-Token: <SHORTCUT_CAPTURE_TOKEN>' \
  -d '{"text":"такси 18к","clientId":"<one id per capture>","capturedAt":"2026-10-27T09:15:00+05:00"}'

# outside production, from this machine, without a token
curl -sS -X POST http://localhost:3000/api/quick-capture \
  -H 'Content-Type: application/json' \
  -H 'X-Shortcut-User-Id: <TELEGRAM_ID>' \
  -d '{"text":"такси 18к"}'
```

The response is the ordinary Quick Capture envelope with `data.source: "ios_shortcut"`.

**Repeats.** A `clientId` makes a retry safe: the same `clientId` from the same owner answers with the records of the
first capture (`repeated: true`) and writes nothing (FT-106). Without it every run is a new record.

**Revoking the token.** Put a new value in `SHORTCUT_CAPTURE_TOKEN` in `.env.local` and restart the service; the old
token stops working at once (the server keeps only the current value). Then put the new token into the Shortcut.

What it still is not (decision 2026-10-26: one owner, the API only in the tailnet):

- One token per server, not per user or device: no issuance, expiry or audit trail. Anyone holding the token writes
  for the owner — the Shortcut keeps it in plain text on the phone.
- The rate limit is still the shared per-IP AI limiter (see below); there is no separate budget for the Shortcut.

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
  "userName": "Shukur",
  "source": "miniapp"
}
```

| Field | Type | Required | Behavior |
|---|---|---|---|
| `text` | `string` | yes | Must be a non-empty string with non-whitespace content. Max **2000 characters** (checked on the raw string, before trimming). Trimmed before parsing; the trimmed value is echoed back as `data.text`. |
| `userId` | `string` | no | The signed-in user's Telegram id, if sent at all (the Mini App still sends it); someone else's is `403 ACCESS_DENIED`, a value that is not one non-blank string is `400 INVALID_USER_ID` (FT-162). The owner is always the signed-in user. |
| `userName` | `string` | no | Passed to the parser/user pipeline. A non-string value is silently treated as absent. |
| `source` | `"telegram" \| "miniapp" \| "ios_shortcut"` | no | Validated against the enum and echoed back. Since FT-103 it is **stored on every created record** (`transactions.source`); without it the records get `miniapp`. |
| `clientId` | `string` | no | FT-106. The client's id for this capture: letters, digits and `-`, up to 64. A repeat returns the records of the first capture (`repeated: true`) without parsing again; see [docs/pastel/api.md](pastel/api.md#повтор-из-офлайн-очереди-ft-106). |
| `capturedAt` | `string` | no | FT-175. When the phrase was typed on the phone: ISO 8601 with seconds and a time zone, `2026-10-27T09:15:00+05:00` or `2026-10-27T04:15:00.250Z`. The records are dated by that day, «вчера» is the day before it. `null` is the same as absent. See [Time of input](#time-of-input-capturedat). |

Unknown extra fields are ignored (the handler destructures only the six fields above).

Validation order inside the handler: `text` present/non-blank → `text` length → `source` enum → `clientId` format →
`capturedAt` format. The limits of `capturedAt` are checked by the service, after a repeat of the `clientId` is answered.

---

## Time of input (`capturedAt`)

A phrase from the iOS app's offline queue (FT-161) reaches the server hours or days after it was typed. With
`capturedAt` the server counts the day from the time of input, not from the time of the request
(`src/modules/quickCapture/domain/capturedAt.ts`, decisions of FT-175):

- **The day of input** is that moment's day **on the user's calendar** — Tashkent for every user now, the zone every
  record date is kept in (`toDateOnly` on create, `DEFAULT_TIME_ZONE`). The zone written in `capturedAt` only fixes the
  moment, it does not choose the day: JavaScript's `toISOString()` and many iOS formatters write UTC (`…Z`), and a
  phrase sent to the bot or typed in the Mini App at the same moment must land on the same day. On a trip the record
  still lands on the Tashkent day, as it does through the bot. `users.timezone` (which the bot's summaries of FT-124
  read) is not read here, as by no record write yet: every user has the default, and when one does not, the day of
  input and `toDateOnly` move to it together.
- **The fast paths** (`такси 18к`, `перевел 500к на Alif`, `зарплата 5 млн`) write the record on the day of input;
  «сегодня», «вчера», «позавчера» (also `bugun`, `kecha`, `today`, `yesterday`) in the phrase move it back 0, 1 or
  2 days and leave the record's note with the comma next to them (`src/modules/voiceProcessing/domain/phraseDay.ts`).
  A phrase that names any other day — a weekday («в понедельник»), «завтра», «неделю назад», «на прошлой неделе»,
  «вчерашний», «на днях», «в выходные» — goes to the AI. A month alone does not: «аренда на ноябрь» is a period, and
  «5 ноября» holds a second number, which sends the phrase to the AI anyway.
- **The AI** is told the day of input with its weekday and the 7 days up to it («Сегодня 2026-10-27, вторник.
  Последние 7 дней: вторник 2026-10-27, понедельник 2026-10-26, …») and counts «вчера», a weekday and the rest from
  it; a record it gives no date gets the day of input. The list is there because the model miscounted weekdays from
  the date alone (`gpt-4.1-mini`: «в понедельник» typed on Tuesday the 27th came back as Sunday the 25th).
- **Ahead of the server** by up to **5 minutes** the time is taken as is: the phone's and the PC's clocks drift a
  little. **Further ahead it is dated by the server's clock** («now») with a warning in the log: a phrase is not typed
  after it arrives, so one of the clocks is wrong — and the PC's in WSL is known to lag after a sleep, which with a
  refusal would turn every capture from the phone into an error.
- **Older than 30 days — `400 VALIDATION_ERROR`, nothing written**, not «now». 30 days is longer than the queue waits
  while the PC is off, and an older record would land in a month already summed up and audited; such a time is a wrong
  phone clock or a stuck record, and «now» would put the record on a silently wrong day. The iOS app keeps a refused
  record on the phone with its text and the error (FT-161: «400 — ошибка у записи, больше не уходит»), so it can be
  written again by hand. A malformed value is `400` too.
- **A repeat** of a `clientId` is answered with the first records **whatever its `capturedAt`** — another time, one
  older than 30 days, none: the limits are checked only for a capture that is about to be parsed, so a record written
  once is never refused on a retry.
- **Without `capturedAt`** the day of input is the server's today on the user's calendar, as before. One fix applies
  to every capture: «today» used to be the UTC day (`new Date().toISOString()`), so from 00:00 to 05:00 in Tashkent the
  AI was told yesterday and the fast paths wrote yesterday's date (FT-175); it is now the Tashkent day, in the
  response's `ack` («Сегодня») too. The bot words its confirmation itself (`recordMessageView.ts`) and already counted
  in Tashkent.

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
| `withoutAmount` | `CapturedWithoutAmount[]` \| absent | FT-123. What the text names without an amount («такси» in «кофе 25к, такси»): **nothing is written** for these. Each item: `description`, `category` (the parser's choice, by name), `type`, `semanticType?`, `date?`, `paymentKind?` (`cash` \| `card`), `merchant?`. The key is omitted when there are none. The bot asks «Сколько?» and writes the item with the answer (`QuickCaptureService.captureWithAmount`); the Mini App ignores it for now. |

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
| `amount` | `number` | Always positive; direction is in `type`. In the record's `currency`, major units. |
| `amountMinor` | `number` | FT-114. The same amount in integer minor units (tiyin, cents), as the review screen computes it. |
| `currency` | `"UZS" \| "USD"` | FT-103. `USD` when the text says «$», «долл…», «usd»; otherwise `UZS`. |
| `accountId` | `string` | FT-103. The account the record went to (named in the text, «нал» → cash, «картой» → card, else the default). |
| `accountName` | `string?` | FT-103. That account's name, for the ack. |
| `assumptions` | `CaptureAssumption[]` | FT-103. What the parse took for granted: `thousands` («45» read as 45 000), `category` (FT-138: a category no word of the record names — the AI's own choice, or «Другое» for a word the fast path did not recognise («стрижка 50000»); none when the words name it by the user's category name, a category-dictionary word or a learned pattern, and none for a fast-path transfer, savings or cash withdrawal; a single-record `ack` then shows «Покупки?»), `account` (`reason: hint \| default`), `currency` (`reason: no_usd_account` — dollars kept on a сум account, record flagged `needsReview`). Shape: [docs/pastel/api.md](pastel/api.md#записи-валюта-и-источник-ft-103). |
| `type` | `"income" \| "expense"` | |
| `semanticType` | `TransactionSemanticType` | e.g. `expense`, `income`, `own_transfer`, `saving_deposit`, `cash_withdrawal`. Normalized from `type` when the parser did not set one. |
| `category` | `string` | The user's category **name** (`"Транспорт"`, `"Кафе"`) since FT-099. |
| `categoryId` | `string` | FT-114. The user's category id, the same as the stored record's `categoryId`: the review screen shows and changes the category by it. |
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
| 400 | `VALIDATION_ERROR` | `capturedAt must be an ISO 8601 time with seconds and a time zone, …` — field `capturedAt` |
| 400 | `VALIDATION_ERROR` | `capturedAt is older than 30 days` (not for a repeat of a `clientId`); a time ahead of the server is not an error |
| 400 | `INVALID_JSON` | Malformed JSON body (global error handler) |
| 400 | `INVALID_USER_ID` | A body or query `userId` that is not one non-blank string — a number, an array, `null`, `''` (FT-162) |
| 401 | `MISSING_AUTH_HEADER` | No `Authorization` header, no browser session |
| 403 | `ACCESS_DENIED` | The body `userId` is not the signed-in user |
| 403 | `ACCESS_DENIED` | A Shortcut's `X-Shortcut-User-Id` is not `SHORTCUT_CAPTURE_OWNER` (or not a Telegram id) |
| 403 | `ACCESS_NOT_ALLOWED` | The signed-in user, or the Shortcut owner, is not in `ALLOWED_TELEGRAM_IDS` (FT-153) |
| 401 | `INVALID_SHORTCUT_TOKEN` | A Shortcut request whose `X-Shortcut-Capture-Token` is missing, empty or wrong while a token is configured (always in production) |
| 403 | `SHORTCUT_CAPTURE_DISABLED` | A Shortcut request in production without the Shortcut set up (`SHORTCUT_CAPTURE_TOKEN` of 32+ characters and `SHORTCUT_CAPTURE_OWNER` on the list) |
| 403 | `SHORTCUT_CAPTURE_TOKEN_REQUIRED` | Outside production: a Shortcut request through the tunnel or from the network while `SHORTCUT_CAPTURE_TOKEN` is empty |
| 403 | `SHORTCUT_OWNER_REQUIRED` | Outside production: a Shortcut request with neither `SHORTCUT_CAPTURE_OWNER` nor `X-Shortcut-User-Id` |
| 401 | `INVALID_AUTH_FORMAT` | `Authorization` header not in `tma <initData>` form |
| 401 | `INVALID_AUTH` | initData hash mismatch or older than 1 hour |
| 401 | `MISSING_USER_DATA` | Valid initData without a `user` payload |
| 429 | `AI_RATE_LIMIT_EXCEEDED` | Shared AI rate limit exhausted for the IP |
| 500 | `AUTH_NOT_CONFIGURED` | `TG_BOT_API_KEY` missing while validating a non-guest request |
| 500 | `INTERNAL_ERROR` | Parser/persistence failure. The underlying error message is **not** leaked to the client. |

Validation failures never reach the service, so they cost no OpenAI call and write nothing.

---

## Examples

### Capture from this machine (local dev)

```bash
curl -sS -X POST http://localhost:3000/api/quick-capture \
  -H 'Content-Type: application/json' \
  -H 'X-Dev-User-Id: <TELEGRAM_ID>' \
  -d '{"text":"такси 18к","source":"miniapp"}'
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
        "amountMinor": 1800000,
        "currency": "UZS",
        "accountId": "acc-1",
        "accountName": "Карта",
        "assumptions": [
          { "kind": "account", "name": "Карта", "reason": "default" }
        ],
        "type": "expense",
        "semanticType": "expense",
        "category": "Транспорт",
        "categoryId": "cat-transport",
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

1. **`source` is stored, the Shortcut contract is unchanged.** Since FT-103 every record keeps its `source`; the
   request and the old response fields did not change, the new response fields are additive.
2. **No parse-without-save / draft.** Every successful capture writes immediately. There is no
   `/parse` + `/commit` split and no `draft` status. The Mini App's review screen (FT-114) therefore edits and
   deletes already-saved rows: each change is a `PUT /api/transactions/:id`, «×» a soft delete with restore, and
   «Изменить» / «Назад» delete the capture's rows and return the text to the field.
3. **Idempotency only with `clientId`.** Since FT-106 a request with a `clientId` is safe to retry; without one a
   retried request still creates duplicate transactions.
4. **Rate limit is coarse.** The AI limiter is per-IP and its 20/15min budget is *shared* with `/api/voice/*`; it is not
   per-user and cannot be tuned separately for capture.
5. **The time of input, not a date.** `capturedAt` (FT-175) dates a capture by when it was typed, at most 30 days back
   and never after the server's clock (beyond 5 minutes); a client cannot set a record's date directly. A day in the phrase («5 октября») still goes
   through the parser.
6. **The Mini App Home composer calls this endpoint** (FT-114, replacing the quick-capture card). Authenticated
   Telegram Mini App users send a phrase through `POST /api/quick-capture` with a `clientId` per phrase; its records
   — one or several — open one review screen. Guest mode keeps data in browser-local IndexedDB, so server-side quick
   capture is intentionally disabled for guests.
7. **One Shortcut token per server.** See [iOS Shortcut capture](#ios-shortcut-capture) — a shared token bound to one
   owner (FT-155); revoked by a new value and a restart; no per-device tokens, expiry or audit trail.
8. **Blank-text guard exists in two places.** The route rejects blank text with `400`; the service additionally
   short-circuits blank input to `no_transaction` without calling the parser. The service-level path is only reachable
   by in-process callers such as the Telegram handler.

## Planned but not implemented

Referenced in the earlier plans/spec, absent from the shipped contract:

| Item | Where it was proposed | Status |
|---|---|---|
| `occurredAt` request field | `.hermes/plans/2026-09-02_130400-api-first-quick-actions-spec.md` §5.2 | Not implemented; ignored if sent. The time of input `capturedAt` shipped instead (FT-175, see [above](#time-of-input-capturedat)). |
| `clientRequestId` idempotency key | same, §5.2 | Not implemented; ignored if sent. |
| `draft` status + `POST /api/quick-actions/parse` / `/commit` | same, §5.3 | Not implemented. |
| `error` status in the response body | same, §5.2 | Not implemented — errors are HTTP status codes. |
| Singular `transaction` field | same, §5.2 | Shipped as the array `transactions` (multi-item input is supported). |
| `change_category` ack action | same, §5.2 | Not implemented; actions are `edit` / `delete` / `review`. |
| Per-user Shortcut token auth | implementation plan, Phase I | Not implemented. One server token bound to one owner shipped instead (`FT-075`, `FT-155`, see [Auth](#ios-shortcut-capture)); per-device issuance and expiry are not planned while there is one user. |

---

## Source of truth

Read these before changing the contract:

- `src/modules/quickCapture/domain/quickCaptureTypes.ts` — the contract types
- `src/modules/quickCapture/application/quickCaptureService.ts` — status resolution
- `src/modules/quickCapture/application/buildCaptureAck.ts` — ack wording
- `src/modules/quickCapture/application/toCapturedTransaction.ts` — shared transaction mapping (also used by voice)
- `src/modules/quickCapture/domain/capturedAt.ts` — the format, limits and day of `capturedAt` (FT-175)
- `src/modules/voiceProcessing/domain/phraseDay.ts` — «сегодня», «вчера», «позавчера» on the fast paths (FT-175)
- `src/modules/quickCapture/presentation/controllers/quickCaptureController.ts` — HTTP validation, auth, rate limit
- `src/delivery/web/express/middleware/authMiddleware.ts` — `allowShortcutCapture` (the Shortcut token and its owner)
- `src/shared/domain/access/shortcutCaptureAccess.ts` — the Shortcut setting rules, also checked at start
- `src/delivery/web/express/expressServer.ts` + `src/index.ts` — mount path
- `src/delivery/messaging/telegram/handlers/messageHandlers.ts` — Telegram as a client

Tests that pin this behavior:

- `tests/quickCaptureRoutes.test.ts` — HTTP validation, auth, envelope, error mapping
- `tests/shortcutCaptureOwner.test.ts` — the Shortcut in production: owner binding, token, repeats, start checks (FT-155)
- `tests/localDevAuth.test.ts`, `tests/allowedTelegramIds.test.ts` — the Shortcut outside production and the list
- `tests/quickCaptureService.test.ts` — status resolution, semantic safeguards, multi-item, debts
- `tests/captureTimeOfInput.test.ts`, `tests/capturedAt.test.ts`, `tests/captureDay.test.ts` — the time of input, its
  limits and repeats, the day words of the fast paths, the Tashkent day before 05:00 (FT-175)
- `tests/buildCaptureAck.test.ts` — ack wording
- `tests/telegramMessageHandlers.test.ts` — Telegram routing through the boundary
