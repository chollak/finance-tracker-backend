# Quick Capture-first Finance Tracker Product Spec

> **For Hermes:** This is a product/technical specification before implementation. Do not start coding until Shukur explicitly approves the scope and task order. When implementation starts, use narrow TDD slices and keep Hermes as QA gatekeeper.

**Goal:** Turn Finance Tracker into a low-friction daily expense capture tool: expenses can be recorded from Telegram, iPhone Action Button/Shortcuts, and Mini App in 1–2 actions, while preserving semantic correctness.

**Architecture:** Keep the existing Telegram-first Node.js/TypeScript backend and Mini App. Add a shared Quick Capture layer so Telegram text/voice, Mini App quick add, and future iOS Shortcut API all reuse the same parsing/creation/ack semantics instead of diverging.

**Tech Stack:** Existing repo stack: Node.js 20, TypeScript, Telegraf, Express, SQLite local mode, React/Vite Mini App, TanStack Query, existing tests (`npm run verify`). No production deploy, no Supabase changes, no iOS-native app in this spec.

---

## 1. Product thesis

Current pain:

> “Мне лень каждый раз заходить в Telegram и записывать траты.”

New product direction:

> **Finance Tracker = SyncSpend-like Quick Capture + Aurum-like semantic finance model.**

Meaning:
- SyncSpend inspires the speed, minimalism, Action Button/Shortcuts entry points, and “capture at the moment of payment” UX.
- Aurum inspires the financial correctness: accounts/cards, transfers vs real expenses, derived balances, honest captions, API-first boundaries.

The product should not feel like a finance admin panel. It should feel like a small daily companion that makes capture almost effortless.

---

## 2. Desired end result

After this initiative, Shukur should be able to record a transaction in these ways:

### Flow A — Telegram quick text/voice

```text
Open bot or pinned chat
→ type/voice: “такси 18к”
→ bot shows typing/loading immediately
→ transaction saved
→ bot replies with short ack + correction buttons
```

Expected ack:

```text
✅ Записал

Такси
18 000 сум · Транспорт
Сегодня · TBC

[Категория] [Карта]
[Дата] [Удалить]
```

### Flow B — iPhone Action Button MVP, no direct backend API yet

```text
Press Action Button
→ Apple Shortcut asks: “Что потратил?”
→ user dictates/types: “кофе 35к”
→ Shortcut opens Telegram bot with prepared text / deep link as close as iOS allows
→ user sends message
→ bot saves normally and replies with ack
```

Acceptance:
- no need to manually find Telegram or the bot;
- at most one manual Telegram confirmation/send tap if iOS/Telegram does not allow auto-send;
- the backend sees the same text as normal Telegram input, so no duplicate parsing logic.

### Flow C — iPhone Shortcut direct API, next level

```text
Press Action Button
→ Apple Shortcut asks: “Что потратил?”
→ Shortcut POSTs text to Finance Tracker quick capture API
→ backend parses and saves
→ Shortcut shows a short success/error response
→ optional: backend sends Telegram ack/notification with correction link/buttons
```

Acceptance:
- Telegram app does not need to open;
- security is explicit and safe enough for a public tunnel/domain;
- endpoint reuses the same Quick Capture service as Telegram;
- errors are human-readable on iPhone.

### Flow D — Mini App Daily Home

```text
Open Mini App
→ first visible action is Quick Capture
→ below: Today summary, recent transactions, review queue
```

Main screen should answer:
- “Сколько я сегодня реально потратил?”
- “Что я только что записал?”
- “Что нужно проверить/исправить?”

Not primary on home:
- heavy analytics;
- premium upsell;
- dense charts;
- all historical management.

---

## 3. Scope boundaries

### In scope

1. Product specification and task board alignment.
2. Telegram quick capture UX improvements.
3. iPhone Action Button MVP via Apple Shortcuts opening Telegram/deep link.
4. Mini App quick capture-first design direction.
5. Later: direct Quick Capture API for Apple Shortcuts.
6. Shared semantic Quick Capture service boundary.
7. Documentation/instructions for setting up the iPhone Shortcut.
8. Screenshot-backed UI QA when design work starts.

### Out of scope for now

- No production deploy.
- No Supabase SQL/migrations.
- No iOS-native app.
- No Apple Wallet automation as P0/P1.
- No Notion sync.
- No crypto/net worth/ROI/Aurum-sized finance OS features.
- No premium/subscription policy changes.
- No broad rewrite of existing modules.
- No pixel-perfect cloning of SyncSpend brand/UI. Target: similar simplicity and quality, not copying.

---

## 4. Core principles

1. **Capture before analytics.** If data is not entered, analytics is worthless.
2. **Fast path first.** Simple inputs like `такси 18к` must be saved quickly and correctly.
3. **Semantic correctness over speed when ambiguous.** Own transfers, cash withdrawals, deposits, debt, refunds, reimbursements must not become real expenses silently.
4. **Save first, correct fast.** Avoid long forms before saving; provide lightweight correction after saving.
5. **One Quick Capture pipeline.** Telegram, Mini App, and Shortcuts must converge into one backend flow.
6. **Honest money captions.** UI must say what is included/excluded: “без переводов”, “реальные расходы”, “доход − расход”.
7. **Mobile-first.** Large touch targets, no dense tables on the primary daily path.
8. **No distracting expansion.** Do not build Aurum-level depth until quick capture becomes habitual.

---

## 5. Users and devices

Primary user now: Shukur.

Main device/context:
- iPhone in daily life;
- Telegram bot/Mini App;
- Action Button on supported iPhone;
- local WSL backend + SQLite during development;
- Cloudflare quick tunnel only for local phone/Mini App testing when explicitly needed.

Future users:
- friends/family only after dogfooding;
- public launch later, not part of this spec.

---

## 6. Functional requirements

## 6.1 Shared Quick Capture domain

Create a conceptual backend layer, even if first implementation only refactors lightly:

```text
QuickCaptureInput
- text: string
- source: telegram_text | telegram_voice | miniapp | ios_shortcut_telegram | ios_shortcut_api
- userId / telegramId
- userName?
- locale: ru/en?
- occurredAt?
- defaultAccountId?
- metadata?
```

```text
QuickCaptureResult
- status: saved | needs_review | no_transaction | error
- transactions[]
- debts[]
- originalText
- ackText
- correctionActions[]
- reviewReasons[]
```

Requirement:
- Telegram text handler should eventually call this service.
- Direct Shortcut API should call the same service.
- Mini App quick add should either use the same parser or clearly document why it is a manual structured path.

Likely existing files to inspect/change later:
- `src/modules/voiceProcessing/application/processTextInput.ts`
- `src/delivery/messaging/telegram/handlers/messageHandlers.ts`
- `src/delivery/messaging/telegram/formatters/transactionFormatter.ts`
- `src/modules/transaction/application/createTransaction.ts`
- `src/modules/transaction/domain/transactionSemanticType.ts`

## 6.2 Telegram ack and correction UX

After successful save, Telegram should respond with compact confirmation.

Required content:
- saved status;
- description/merchant;
- amount;
- semantic category/type;
- account/card when available;
- whether it counts as real expense;
- quick correction actions.

Buttons minimum:
- `Категория`
- `Карта` / `Счёт` if account support exists in current model, otherwise postpone with TODO
- `Дата`
- `Удалить`
- `Открыть в Mini App`

Rules:
- low confidence or ambiguous semantic type should go to review/confirmation instead of silent save;
- own transfers/deposits/cash withdrawals must not be styled/reported as normal red expenses;
- ack should be short enough for Telegram, no long AI explanation by default.

Likely files:
- `src/delivery/messaging/telegram/handlers/messageHandlers.ts`
- `src/delivery/messaging/telegram/keyboards/confirmationKeyboard.ts`
- `src/delivery/messaging/telegram/keyboards/categoryKeyboard.ts`
- `src/delivery/messaging/telegram/formatters/transactionFormatter.ts`
- `src/delivery/messaging/telegram/i18n/ru.ts`

## 6.3 iPhone Action Button MVP via Shortcut → Telegram

Deliverable should include a user-facing setup guide, not necessarily code first.

Target shortcut behavior:
1. Action Button runs Apple Shortcut.
2. Shortcut asks for input: `Что потратил?`
3. User types or dictates natural text.
4. Shortcut opens Telegram bot/deep link with text prepared as much as possible.
5. User taps Send if Telegram requires manual confirmation.
6. Bot processes normally.

Need research/spike before implementation:
- exact Telegram iOS deep link behavior for bot text prefill;
- whether `tg://resolve?domain=<bot>&text=<encoded>` works on current Telegram iOS;
- whether `https://t.me/<bot>?start=...` is unsuitable because `/start payload` is not a normal message;
- whether Shortcut can copy text to clipboard and open bot as fallback;
- whether the simplest reliable flow is: ask input → copy to clipboard → open bot → user paste/send.

Acceptance:
- documented step-by-step setup for Shukur;
- no secrets stored in Shortcut;
- no backend change required for MVP;
- tested on real iPhone before marking done.

Likely docs file:
- `docs/knowledge-base/08-development/ios-action-button-shortcut.md` or similar.

## 6.4 Direct Shortcut API

This is next-level after MVP, not first slice.

Potential endpoint:

```http
POST /api/quick-capture
Authorization: Bearer <shortcut_token>
Content-Type: application/json

{
  "text": "такси 18к",
  "source": "ios_shortcut"
}
```

Potential response:

```json
{
  "status": "saved",
  "summary": "Такси · 18 000 сум · Транспорт",
  "transactionId": "...",
  "needsReview": false,
  "actionsUrl": "https://.../transactions/..."
}
```

Security requirements before building:
- Do not reuse Telegram bot token.
- Do not put OpenAI keys or DB credentials in Shortcut.
- Use a revocable per-user Shortcut token stored server-side hashed if possible.
- Token should be scoped only to quick capture for one user.
- Endpoint must rate-limit safely but not break daily capture.
- Public URL requirement must be explicit: local Cloudflare tunnel for testing; production later.

Likely files:
- `src/delivery/web/express/expressServer.ts`
- `src/modules/voiceProcessing/application/processTextInput.ts`
- `src/modules/user/` for mapping token → user
- `src/shared/application/helpers/userIdResolver.ts`
- tests under `tests/` for auth and endpoint behavior

## 6.5 Mini App quick capture-first home

Current quick add exists, but the product direction should make it primary.

Existing relevant files:
- `webapp/src/features/quick-add/ui/QuickAddForm.tsx`
- `webapp/src/features/quick-add/ui/QuickAddSheet.tsx`
- `webapp/src/shared/ui/bottom-nav.tsx`
- `webapp/src/pages/home/ui/HomePage.tsx`
- `webapp/src/widgets/recent-transactions/ui/RecentTransactions.tsx`
- `webapp/src/widgets/attention-summary/ui/AttentionSummary.tsx`
- `webapp/src/widgets/home-trust-summary/ui/HomeTrustSummary.tsx`

Desired Home structure:

```text
[Top: Today / date]
[Primary Quick Capture card/input]
[Today real spend]
[Recent transactions]
[Needs review]
[Secondary: budget glimpse]
```

Design constraints:
- quick capture visible without scrolling on iPhone viewport;
- bottom nav has one clear central add action;
- no competing mobile FABs;
- no dense charts above capture;
- review queue should be visible when there are ambiguous transactions.

## 6.6 SyncSpend-inspired design system

Target feeling:
- calm;
- minimal;
- fast;
- not an admin dashboard;
- soft financial utility.

Do:
- consistent spacing scale;
- consistent card radius, border, shadows;
- large amount typography;
- clear primary action;
- semantic color tokens;
- accessible contrast;
- loading/empty/error states.

Do not:
- clone SyncSpend pixel-by-pixel;
- use green for generic CTA just because it is positive;
- make every screen look like analytics;
- hide the main action under tabs/forms.

Likely files:
- `webapp/src/shared/ui/button.tsx`
- `webapp/src/shared/ui/card.tsx`
- `webapp/src/shared/ui/typography.tsx`
- `webapp/src/shared/ui/page-header.tsx`
- `webapp/src/shared/ui/layout.tsx`
- `webapp/src/shared/ui/dock.tsx`
- `webapp/src/shared/ui/bottom-nav.tsx`
- `webapp/src/entities/transaction/ui/TransactionCard.tsx`
- `webapp/src/entities/transaction/ui/TransactionListItem.tsx`

Visual QA required:
- screenshots at 375, 390/393, 412 px widths;
- real Telegram Mini App frame when possible;
- verify bottom nav alignment and content not hidden behind dock;
- verify light/dark if current app supports both;
- verify Cyrillic typography feels consistent.

---

## 7. Non-functional requirements

### Performance

- Simple quick capture should feel immediate.
- Bot must show `typing`/processing feedback before slow parsing.
- Fast-path parser should handle obvious short inputs without unnecessary OpenAI when safe.
- Ambiguous semantic inputs should prefer correctness/review over speed.

### Reliability

- No duplicated transactions from retries if possible.
- Shortcut API must handle network errors with clear messages.
- Telegram polling reliability should remain intact.

### Security

- No secrets printed in logs.
- No real tokens in docs.
- Shortcut direct API must use a dedicated token, not Telegram/OpenAI secrets.
- Do not expose unauthenticated write endpoints.

### Data correctness

- Store original input text.
- Preserve parser confidence/review reasons.
- Real expenses must exclude own transfers, deposits/savings movement, cash withdrawals, debt movements, refunds/reimbursements.

### Maintainability

- Avoid another parallel parser just for Shortcut.
- Quick Capture service should be testable without Telegram context.
- UI primitives should be shared instead of per-page styling drift.

---

## 8. Suggested task order

### Phase 0 — Spec alignment only

**Objective:** Confirm scope before coding.

Tasks:
1. Review this spec with Shukur.
2. Decide whether `TASKS.md` should get a new Quick Capture section before current FT queue or after FT-044.
3. Decide what “done” means for Action Button MVP on real iPhone.
4. Decide whether design-system work starts as audit first or implementation first.

No code changes.

### Phase 1 — iPhone Shortcut MVP research + guide

**Objective:** Prove the lowest-friction no-backend Shortcut flow.

Deliverables:
- tested Shortcut recipe;
- docs page with exact steps and screenshots if possible;
- known limitations of Telegram iOS deep links.

Definition of Done:
- pressing Action Button starts the expense capture prompt;
- Telegram bot opens with the text ready, or fallback clipboard flow is documented;
- Shukur can use it daily without backend/API changes.

### Phase 2 — Telegram ack/correction UX

**Objective:** Make bot confirmation feel quick and correct.

Deliverables:
- compact ack message;
- correction buttons;
- tests around formatter/keyboard behavior;
- no regression in low-confidence confirmation flow.

Definition of Done:
- normal text input gives short ack;
- ambiguous input asks for confirmation/review;
- delete still works;
- `npm run test:ci` and relevant targeted tests pass.

### Phase 3 — Shared Quick Capture service boundary

**Objective:** Prepare one pipeline for Telegram + Mini App + Shortcut API.

Deliverables:
- extracted/defined service/use case around text quick capture;
- Telegram handler calls it;
- tests for source metadata and result shape.

Definition of Done:
- existing Telegram behavior preserved or improved;
- no duplicated parsing logic;
- service can be called from HTTP without Telegraf objects.

### Phase 4 — Mini App daily quick capture home

**Objective:** Make Mini App home capture-first.

Deliverables:
- revised Home information architecture;
- Quick Capture card/sheet visible and primary;
- today summary + recent + review queue;
- screenshot-backed visual QA.

Definition of Done:
- first viewport shows quick capture entry;
- bottom nav remains symmetric and usable;
- screenshots at 375/390/412 px look polished;
- `npm run build:webapp` passes.

### Phase 5 — SyncSpend-inspired design system slice

**Objective:** Make UI consistent without broad risky rewrite.

Deliverables:
- design tokens/primitives adjusted;
- transaction cards and daily home align visually;
- no raw color drift where semantic tokens should be used.

Definition of Done:
- shared card/button/typography primitives documented or obvious in code;
- visual QA confirms calm/minimal feel;
- `npm run verify` passes before commit.

### Phase 6 — Direct iOS Shortcut API

**Objective:** Allow Action Button capture without opening Telegram.

Deliverables:
- secure `/api/quick-capture` endpoint;
- per-user Shortcut token setup/revoke flow;
- Shortcut recipe;
- Telegram notification or Mini App correction link after save.

Definition of Done:
- Shortcut saves a transaction through API on real iPhone;
- invalid/missing token rejected;
- endpoint cannot write for another user;
- clear success/error response;
- rate limit policy approved by Shukur before implementation.

---

## 9. Testing strategy

### Backend tests

Run targeted tests first, then full gate.

Required areas:
- text parsing: short inputs, amount suffixes (`18к`, `35k`, `120 тыс`);
- semantic classification: transfer/deposit/cash/debt/refund not real expense;
- Telegram formatter and keyboards;
- Quick Capture service result shape;
- Shortcut API auth and rate limiting when Phase 6 starts.

Commands:

```bash
npm run test:ci
npm run verify
```

### Frontend tests / visual QA

Commands:

```bash
npm run build:webapp
npm run verify
```

Visual checks:
- 375 px iPhone width;
- 390/393 px common iPhone width;
- 412 px wider mobile;
- Home, Quick Capture, Transactions, More;
- bottom nav center action alignment;
- no content hidden behind dock;
- screenshots reviewed by Hermes, not just build success.

### Real-device checks

Required before Action Button tasks are marked done:
- run Shortcut from Action Button on iPhone;
- confirm Telegram opens correctly;
- confirm input reaches bot;
- confirm ack is readable and buttons work;
- for API phase, confirm Shortcut receives success/error response.

---

## 10. Risks and trade-offs

| Risk | Mitigation |
|---|---|
| Telegram iOS may not support prefilled text reliably | Research first; fallback to clipboard + open bot |
| Direct API endpoint could expose write access | Dedicated scoped token, reject unauthenticated requests, tests |
| UI redesign distracts from capture | Home quick capture first; design system in narrow slices |
| Too much Aurum-style scope creep | Keep net worth/crypto/assets out of current scope |
| Fast parser misclassifies semantic movements | Ambiguous inputs go to review; tests for known finance semantics |
| Shortcut direct API needs public URL | Use Cloudflare tunnel for local test; production explicitly out of scope |

---

## 11. Open decisions for Shukur

1. Should Quick Capture tasks become the new top priority before `FT-044`, or should we finish `FT-044` first and then pivot?
2. For Action Button MVP, is “opens Telegram with text copied/prepared, then I tap Send” acceptable as done?
3. Should the first UI slice be a **design audit** or direct implementation of new Home/Quick Capture layout?
4. Do we want accounts/cards (`TBC`, `Копилка`, `вклад`, `наличные`) included in the first quick capture UX, or keep it as correction after save?
5. For direct Shortcut API, are we okay with a Cloudflare tunnel/local-only experiment first before real domain/prod?

---

## 12. Final definition of done for the whole initiative

The initiative is complete when:

- [ ] Shukur can press iPhone Action Button and start expense capture without manually finding Telegram.
- [ ] Telegram bot saves short natural inputs and returns compact ack + correction actions.
- [ ] Mini App home is daily-use/quick-capture-first, not dashboard-first.
- [ ] UI has a calm SyncSpend-inspired design direction without copying brand/pixels.
- [ ] Real expenses, transfers, deposits, cash withdrawals, debts, refunds are visually and analytically separated.
- [ ] Direct Shortcut API is either implemented securely or explicitly deferred with reasons.
- [ ] Relevant docs and `TASKS.md` reflect the new product direction.
- [ ] `npm run verify` passes on final implementation.
- [ ] Real iPhone Action Button flow is tested and confirmed by Shukur.
