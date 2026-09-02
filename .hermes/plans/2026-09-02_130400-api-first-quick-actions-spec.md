# API-first Quick Actions Finance Tracker Spec

> **For Hermes:** This is the corrected product specification. It supersedes the earlier broader `quick-capture-product-spec` direction for now. Do not implement yet. When implementation starts, keep slices narrow, API-first, and verify with tests/screenshots/real iPhone Shortcut flow.

**Goal:** Temporarily strip Finance Tracker down to the smallest useful product: fast expense/income actions through an API-first core, with Telegram/Mini App/iPhone Shortcuts as thin clients around the same API.

**Architecture:** Build the system around a small, stable Quick Actions API. Telegram bot, Mini App, and iPhone Shortcuts must be clients of this API/application layer, not separate product surfaces with duplicated behavior. Existing broad features stay hidden/deprioritized, not expanded.

**Tech Stack:** Existing repo only: Node.js 20, TypeScript, Express, Telegraf, SQLite local mode, React/Vite Mini App. No production deploy, no Supabase, no native iOS app, no Aurum-like expansion.

---

## 1. Product decision

Shukur changed direction:

> Сейчас полный фокус на быстрые действия. Aurum-like пока не нужен. Хочу временно избавиться от всех текущих фич в пользу минимальных действий, Spendy/SyncSpend/Qalta-like. Также хочу настроить API-first, чтобы вокруг этого API дальше проектировать систему.

Important clarification from Shukur:

> Понравился не только UI, а именно идея и философия SyncSpend. Qalta тоже понравился — “как будто то, что я хотел сам сделать”.

So SyncSpend and Qalta are the main product/philosophy references for this phase, not merely visual style references.

- **SyncSpend:** minimalism, Notion/iCloud sync, Shortcuts/Apple Pay trigger, frictionless expense logging.
- **Qalta:** “track money at the speed of speech”, AI voice logging, receipt/document scan, iPhone-native entry points, action-first dark/light mobile UX.

Therefore the current product is not:
- dashboard app;
- budget planner;
- debt manager;
- subscription/premium product;
- net worth / assets / Aurum-style finance OS.

The current product is:

> **Minimal API-first quick finance capture system.**

Core promise:

> “Я могу записать трату или доход максимально быстро, из любого входа, и потом при необходимости поправить.”

---

## 2. Desired result

At the end of this initiative, Shukur should have a simplified working product with these qualities:

1. **One API-first core** for quick actions.
2. **Telegram bot** uses the same quick action flow.
3. **Mini App** becomes minimal: quick add + recent list + basic edit/delete.
4. **iPhone Action Button / Shortcut MVP** can start capture without manually opening Telegram.
5. **Optional direct Shortcut API** is designed and then implemented only after auth/security is clear.
6. Existing features are hidden/deprioritized from the primary UI: analytics, budgets, debts, premium, complex dashboard.
7. UI/UX feels Spendy/SyncSpend-like: fast, calm, minimal, one primary action.

---

## 3. Non-goals

Hard non-goals for this phase:

- No Aurum-like finance OS.
- No net worth, crypto, ROI, asset allocation.
- No new budget features.
- No new debt features.
- No premium/subscription work.
- No heavy analytics or reports.
- No Notion sync.
- No production deploy or Supabase changes.
- No native iOS app.
- No Apple Wallet automation yet.
- No broad rewrite of backend modules unless needed to expose a clean API boundary.
- No pixel-perfect copy of SyncSpend/Spendy UI; target the same simplicity and speed, not cloning.

Important: “temporarily remove” should mean **hide from primary UX / route out of the main flow**, not delete stable code/data unless Shukur explicitly approves deletion.

---

## 4. Product model: Quick Actions, not full finance app

### Primary actions

P0 actions:

1. **Add expense**
   - text: `такси 18к`, `кофе 35000`, `продукты 120000`
   - structured: amount + description/category optional

2. **Add income**
   - text: `+1200000 зарплата`, `получил 2 млн`

3. **List recent transactions**
   - today/recent 10–20 items

4. **Delete last / delete transaction**
   - fast correction path

5. **Edit basic fields**
   - amount;
   - description;
   - category;
   - date;
   - type.

P1 actions:

6. **Mark not real expense / transfer-like movement**
   - only if current semantic model already supports it safely;
   - otherwise keep as review/correction.

7. **Review queue**
   - ambiguous parses that need user confirmation.

Not primary:
- budgets;
- debts;
- analytics;
- premium;
- weekly reports;
- complex account/card management.

---

## 5. API-first requirements

## 5.1 API shape

Design around `/api/quick-actions` or `/api/quick-capture`.

Recommended minimal endpoint set:

```http
POST /api/quick-actions/parse
POST /api/quick-actions/commit
POST /api/quick-actions/capture
GET  /api/quick-actions/recent
PATCH /api/quick-actions/transactions/:id
DELETE /api/quick-actions/transactions/:id
```

Alternative if simpler:

```http
POST /api/quick-capture
GET  /api/transactions/recent
PATCH /api/transactions/:id/quick
DELETE /api/transactions/:id
```

Prefer fewer endpoints if implementation becomes simpler, but keep the boundary explicit.

## 5.2 Capture endpoint

Main endpoint:

```http
POST /api/quick-capture
Content-Type: application/json
Authorization: <client auth depending on source>

{
  "text": "такси 18к",
  "source": "telegram | miniapp | ios_shortcut",
  "occurredAt": "2026-09-02T13:04:00+05:00",
  "clientRequestId": "optional-idempotency-key"
}
```

Response:

```json
{
  "status": "saved | needs_review | no_transaction | error",
  "transaction": {
    "id": "...",
    "amount": 18000,
    "type": "expense",
    "semanticType": "expense",
    "description": "такси",
    "category": "transport",
    "date": "2026-09-02",
    "countsAsRealExpense": true
  },
  "ack": {
    "title": "✅ Записал",
    "summary": "Такси · 18 000 сум · Транспорт",
    "details": "Сегодня",
    "actions": ["edit", "delete", "change_category"]
  },
  "review": {
    "reasons": []
  }
}
```

## 5.3 Parse/commit split

If needed for Mini App or Shortcut UX:

```http
POST /api/quick-actions/parse
```

Returns draft, does not save:

```json
{
  "status": "draft",
  "draft": {
    "amount": 18000,
    "description": "такси",
    "category": "transport",
    "type": "expense",
    "confidence": 0.92
  }
}
```

Then:

```http
POST /api/quick-actions/commit
```

This is useful if the client wants a confirmation screen. But default path should be **capture/save immediately** for obvious input.

## 5.4 Source clients

All clients call the same API/application service:

```text
Telegram text/voice
    ↓
Quick Capture API/application service
    ↓
Transaction saved + ack

Mini App quick input
    ↓
Same API/application service
    ↓
Transaction saved + recent list updated

iPhone Shortcut
    ↓
Same API/application service
    ↓
Transaction saved + response shown
```

No duplicated parsers per client.

---

## 6. Authentication / security

### P0/P1: Telegram and Mini App

Use existing Telegram auth/user resolution. Do not introduce broad auth rewrites first.

### P2: iOS Shortcut direct API

Before implementing direct API from Shortcut:

- create a dedicated per-user Shortcut token;
- token is revocable;
- token only allows quick capture for one user;
- token is not Telegram bot token;
- token is not OpenAI key;
- token is never printed in logs;
- invalid token returns 401/403;
- rate limit is explicit and approved by Shukur.

Possible auth shape:

```http
Authorization: Bearer ft_shortcut_xxx
```

Token storage:
- preferably hash token server-side;
- show/copy token only once;
- for local-only MVP, can start with `.env.local` only if clearly documented as temporary and not production-safe.

---

## 7. UI/UX direction: Spendy/SyncSpend-like minimalism

## 7.1 Mini App primary screens

Temporary primary IA:

```text
Home / Capture
History
Settings/More
```

Hide/deprioritize from main nav:
- Budgets;
- Debts;
- Analytics;
- Premium;
- complex dashboard blocks.

Do not delete routes at first; remove from primary navigation and simplify Home.

## 7.2 Home screen

Desired first viewport:

```text
Today
[large quick input / + button]

Spent today: 185 000 сум

Recent
- Такси · 18 000
- Кофе · 35 000
- Продукты · 132 000
```

If there is review queue:

```text
Needs review
- “перевел 500к” — transfer or expense?
```

Not above the fold:
- charts;
- financial health;
- premium cards;
- budget overview;
- dense analytics.

## 7.3 Quick input UX

Preferred UI:

```text
Что добавить?
[ такси 18к                         ]
[Сохранить]
```

Optional details hidden behind disclosure:
- date;
- type;
- category;
- note.

Rules:
- default to fast text capture;
- no mandatory category selection before save for obvious inputs;
- after save, show compact confirmation and allow edit.

## 7.4 Visual style: SyncSpend/Qalta-like

Shukur explicitly wants the design to follow the idea, philosophy, and visual feeling of SyncSpend/Qalta.

Interpretation:
- **Yes:** use SyncSpend and Qalta as the strongest visual/UX references: calm, minimal, mobile-native, focused on one quick action, voice-first where possible.
- **No:** do not clone copyrighted screens, brand assets, exact icon/logo, copy, or pixel-perfect layout. Build a Finance Tracker design system with the same product feeling.

Target feel:
- calm;
- light/dark-ready;
- modern;
- iOS-like mobile utility;
- no “admin panel”;
- no dense enterprise dashboard;
- one clear CTA;
- quick input/voice action is visually dominant;
- scan/voice/add are primary actions;
- everything else is secondary.

Design language to pursue:
- soft off-white / warm neutral app background in light mode;
- deep clean black/charcoal in dark mode;
- rounded cards with subtle border/shadow;
- generous whitespace;
- large numeric typography;
- compact section headers;
- clear bottom action cluster / central `+`;
- minimal iconography;
- transaction rows that are easy to scan;
- short labels, no long explanatory UI text above the fold;
- strong empty states that push the user to add the first transaction.

Design tokens/primitives:
- `PageShell` / daily page container;
- `QuickCaptureCard`;
- `VoiceCaptureButton`;
- `ScanCaptureButton` as future placeholder if not implemented now;
- `AmountText`;
- `TransactionRow` / `RecentTransactionItem`;
- `PrimaryActionButton` / central add action;
- `BottomActionDock` with minimal actions: scan / voice / add or capture / history / settings;
- shared card radius, border, shadow, padding;
- semantic colors only when meaning is financial/destructive/warning;
- neutral/brand color for generic primary action.

SyncSpend/Qalta-inspired Home direction:

```text
[Date / Today]
[Large Quick Capture / Voice card]
[Small summary: spent today]
[Recent transactions]
```

SyncSpend/Qalta-inspired capture direction:

```text
[Amount or natural text input]
[Voice button prominent]
[optional category/date collapsed]
[Save]
```

For AI-parsed multi-item input, use Qalta-like preview:

```text
AI parsed:
- Breakfast · $12
- OpenAI · $19.90 monthly
- Transfer · $1,000

[Cancel] [Save]
```

Visual QA acceptance:
- Claude Code must capture screenshots at 375, 390/393, and 412 px;
- Claude Code must perform the first QA pass: build/tests/screenshots/visual review;
- Hermes performs final verification of Claude Code's report, diff, and key screenshots before commit/push;
- primary action must be obvious in the first viewport;
- UI should feel like a lightweight iPhone app, not a Telegram admin dashboard;
- old features must not visually compete with Quick Capture.

---

## 8. iPhone Action Button direction

## 8.1 MVP: Shortcut → Telegram

Flow:

```text
Action Button
→ Apple Shortcut asks “Что потратил?”
→ user dictates/types text
→ Shortcut opens Telegram bot with prepared text OR copies text and opens bot
→ user sends
→ Telegram bot uses same quick capture flow
```

Definition of Done:
- Shukur can trigger it from Action Button;
- no backend direct API required;
- no secrets in Shortcut;
- tested on real iPhone;
- limitations documented.

## 8.2 Next: Shortcut → API

Flow:

```text
Action Button
→ Apple Shortcut asks “Что потратил?”
→ POST /api/quick-capture
→ iPhone shows success/error
→ optional Telegram notification for correction
```

Definition of Done:
- no Telegram open required;
- dedicated token auth;
- can edit/delete the created item afterwards via Mini App or Telegram link;
- tested over Cloudflare tunnel/local URL first.

---

## 9. Temporary feature hiding plan

Purpose: remove distractions without destructive deletion.

### Hide from mobile bottom nav

Keep only:
- Home/Capture;
- History;
- More/Settings;
- center `+` if still useful.

Likely file:
- `webapp/src/shared/ui/bottom-nav.tsx`

### Simplify Home

Replace broad dashboard composition with:
- Quick Capture;
- Today spend;
- Recent transactions;
- Review queue if available.

Likely files:
- `webapp/src/pages/home/ui/HomePage.tsx`
- `webapp/src/features/quick-add/ui/QuickAddForm.tsx`
- `webapp/src/features/quick-add/ui/QuickAddSheet.tsx`
- `webapp/src/widgets/recent-transactions/ui/RecentTransactions.tsx`

### Move old features under More or keep routes hidden

Old features should not be the daily path:
- Analytics;
- Budgets;
- Debts;
- Premium/Usage.

Likely files:
- `webapp/src/pages/more/ui/MorePage.tsx`
- `webapp/src/app/router/routes.tsx`

Do not delete modules yet.

---

## 10. Design production decision

Question from Shukur:

> Нужно ли сделать новую дизайн-систему в Claude Design, или Hermes сам сможет сделать как SyncSpend и Qalta?

Decision:

> **Development and QA must use Claude Code. Hermes is the orchestrator and final verifier, not the implementer or primary QA executor.**

Design workflow decision:

> **Use Claude Design first for concept direction when visual exploration is needed; then Claude Code implements and QA's repo-safe slices; Hermes verifies Claude Code's report/diff before commit/push.**

Reasoning:
- Shukur wants development and QA to always use Claude Code;
- Claude Design is useful for fast visual exploration and a polished artifact direction;
- Claude Code is the implementation agent for actual code changes;
- Hermes should not blindly copy a Claude Design output into the app;
- the app already has Tailwind/CSS variables/shared UI primitives, so the final design must become an internal design system, not a pasted prototype;
- the safest path is: concept → Claude Code implementation+QA slice → Hermes final verification → commit/push.

Recommended design workflow:

1. Hermes writes a **Claude Design prompt/artifact brief** for 2–3 SyncSpend/Qalta-inspired mobile concepts:
   - light mode minimal;
   - dark mode Qalta-like;
   - hybrid Telegram Mini App daily capture.
2. Shukur picks one direction.
3. Hermes writes a narrow Claude Code implementation brief.
4. Claude Code converts the chosen direction into repo primitives:
   - `PageShell`;
   - `QuickCaptureCard`;
   - `BottomActionDock`;
   - `AmountText`;
   - `TransactionRow`;
   - `VoiceCaptureButton`;
   - `CapturePreviewCard`.
5. Claude Code implements only the first screen/slice.
6. Claude Code runs QA: actual diff self-review, build/tests, and screenshots at 375/390/412 px.
7. Hermes final-checks Claude Code's QA evidence and commits/pushes only after verification.

Important constraint:
- do not do pixel-perfect clone of SyncSpend/Qalta;
- copy the philosophy and interaction model, not copyrighted assets/screens.

Fallback rule:
- If Claude Code is unavailable for either implementation or QA, stop and report the blocker.
- Do not switch to Hermes implementation or Hermes-primary QA unless Shukur explicitly allows it for that specific task.

---

## 11. Existing project vs new project decision

Question from Shukur:

> Может быть лучше новую сделать? Или архитектура позволяет делать такие изменения?

Current architecture observations:
- backend already has modular boundaries: `transaction`, `voiceProcessing`, `budget`, `debt`, `dashboard`, `user`, `subscription`;
- Express routes are already separated in `src/delivery/web/express/expressServer.ts`;
- text/voice parsing already exists in `src/modules/voiceProcessing/application/processTextInput.ts` and `processVoiceInput.ts`;
- transaction creation already exists as `CreateTransactionUseCase`;
- frontend already has quick-add, recent transactions, bottom nav, design tokens, shared UI primitives;
- broad features exist, but can be hidden from primary UX without deleting modules.

Decision:

> **Do not start a new project now. Pivot inside the existing repo.**

Why:
- the existing repo already contains the hard parts we need: Telegram, voice/text processing, transaction persistence, Mini App foundation;
- a new repo would recreate plumbing instead of solving the actual product problem;
- current architecture is good enough for an API-first quick actions pivot if we add a clean `quickCapture` application boundary;
- the safer move is to hide/deprioritize old surfaces, not delete code/data.

When a new project would make sense:
- if current architecture blocks a clean Quick Capture API after Phase 1;
- if frontend design debt makes a minimal mobile UI slower than rebuilding;
- if tests/verify become too unstable to safely change;
- if Shukur decides to build a native iOS app instead of Telegram/Mini App.

Current recommendation:

```text
Keep repo
→ add quickCapture boundary
→ make Telegram/Mini App/Shortcut clients of it
→ hide broad features
→ refactor design system gradually
```

Do not do:

```text
New repo
→ rebuild auth/db/Telegram/voice/frontend from scratch
```

---

## 12. Implementation brief for first build cycle

Project path:

```text
~/dev/projects/finance-tracker-backend
```

Product thesis:

> Finance Tracker is an API-first AI Quick Capture system for personal finance. The daily product is not a dashboard; it is the fastest reliable way to record a transaction from Telegram, Mini App, voice, or iPhone Shortcut.

First build cycle scope:

1. Add/define Quick Capture application boundary.
2. Add `POST /api/quick-capture` or repo-consistent equivalent.
3. Reuse existing text parser/AI analysis where safe.
4. Return a compact result/draft shape.
5. Keep old routes working but remove broad features from primary Mini App UX.
6. Start Mini App redesign from the Home/Capture screen only.
7. Do screenshot QA before expanding to other pages.

Hard non-goals for first cycle:
- no native iOS;
- no Apple Pay automation;
- no budgets/debts/analytics expansion;
- no Supabase/deploy;
- no full frontend rewrite;
- no destructive code deletion;
- no pixel-perfect clone.

Preferred slice order:

```text
1. API contract + tests
2. quickCapture service/use case
3. Telegram text path uses same service
4. Mini App Home/Capture simplification
5. design-system primitives for capture screen
6. Action Button Shortcut guide/MVP
```

---

## 13. Suggested implementation phases

### Phase 0 — Approve this spec

No code.

Decisions required:
- confirm “temporary hiding, not deletion”;
- confirm API endpoint naming;
- confirm Action Button MVP acceptance;
- confirm whether direct Shortcut API is P2 after Telegram Shortcut MVP.

### Phase 1 — API contract and tests first

Goal: define the Quick Capture API and result shape.

Tasks:
1. Add/update API contract docs.
2. Add tests for `POST /api/quick-capture` expected behavior.
3. Implement minimal endpoint by reusing existing text processing.
4. Ensure Telegram can later call same service.

Definition of Done:
- API can save `такси 18к` for an authenticated/test user;
- returns compact ack payload;
- no unauthenticated writes;
- tests pass.

### Phase 2 — Telegram uses API/application quick capture result

Goal: Telegram becomes a client of the same quick action flow.

Tasks:
1. Extract common quick capture service/use case.
2. Make text handler use it.
3. Update ack formatting.
4. Keep voice path compatible.

Definition of Done:
- Telegram short input works;
- ack is compact;
- existing semantic safeguards preserved;
- targeted tests + `npm run test:ci` pass.

### Phase 3 — Minimal Mini App

Goal: remove feature clutter and make quick actions primary.

Tasks:
1. Simplify mobile nav.
2. Rebuild Home around quick input and recent list.
3. Hide analytics/budgets/debts from main path.
4. Ensure existing routes do not break if opened directly.

Definition of Done:
- first mobile viewport is quick capture;
- no heavy dashboard blocks on Home;
- History still works;
- screenshots at 375/390/412 px pass visual QA;
- `npm run build:webapp` passes.

### Phase 4 — iPhone Action Button MVP guide

Goal: make daily capture possible without manually opening Telegram.

Tasks:
1. Research exact Telegram iOS deep link behavior.
2. Create Shortcut recipe.
3. Test with real iPhone.
4. Document setup.

Definition of Done:
- Action Button starts capture prompt;
- text is prepared/copied/opened in Telegram;
- Shukur confirms it is usable.

### Phase 5 — Direct Shortcut API

Goal: skip Telegram app entirely.

Tasks:
1. Add Shortcut token auth.
2. Expose direct quick capture endpoint safely.
3. Build Shortcut request flow.
4. Test over Cloudflare tunnel.

Definition of Done:
- Action Button can save transaction without opening Telegram;
- invalid token rejected;
- success/error response visible on iPhone;
- created item can be corrected afterwards.

---

## 14. Testing and verification

Backend:

```bash
npm run test:ci
npm run verify
```

Frontend:

```bash
npm run build:webapp
npm run verify
```

Visual QA:
- mobile screenshots 375/390/412 px;
- Home/Capture;
- History;
- Quick Add sheet/input;
- More/Settings;
- bottom nav alignment;
- no hidden content behind nav.

Real iPhone QA:
- Action Button Shortcut launches;
- dictation/text input works;
- Telegram open/copy/prefill flow works;
- direct API flow later works over tunnel.

---

## 15. Final Definition of Done

This direction is done when:

- [ ] App’s primary UX is quick actions, not finance dashboard.
- [ ] Existing broad features are hidden/deprioritized from daily path.
- [ ] A documented API-first Quick Capture contract exists.
- [ ] `POST /api/quick-capture` or equivalent works for quick text capture.
- [ ] Telegram and Mini App use the same quick capture behavior or documented shared application service.
- [ ] iPhone Action Button MVP works through Shortcut → Telegram/copy/deep link.
- [ ] Direct Shortcut API is implemented securely or explicitly deferred.
- [ ] UI feels minimal/fast/Spendy-like.
- [ ] Tests and visual QA pass.
- [ ] Shukur confirms the real daily capture flow is convenient.

---

## 16. Key correction from previous spec

Previous spec still kept Aurum as a longer-term domain reference. This corrected spec intentionally removes that from current focus.

Aurum-like depth may return later, but for now it is a distraction. The product should be designed from the API and quick action loops outward, not from dashboard features inward.
