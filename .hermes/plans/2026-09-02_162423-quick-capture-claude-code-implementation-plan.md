# API-first AI Quick Capture Implementation Plan

> **For Hermes:** Planning only. Do not implement from this document directly. When user approves execution, use `claude-code` workflow. Claude Code must do implementation **and QA/tests/screenshots**. Hermes only orchestrates, final-checks the Claude Code report/diff, then commits/pushes.

**Goal:** Pivot Finance Tracker into an API-first AI Quick Capture product inspired by SyncSpend/Qalta: fastest possible transaction capture from Telegram, Mini App, voice, and later iPhone Shortcuts.

**Architecture:** Keep the existing repo. Add a small `quickCapture` boundary that reuses existing parsing/transaction modules. Hide old broad product surfaces from primary Mini App UX instead of deleting stable code/data. Implement in narrow slices through Claude Code only.

**Tech Stack:** Node.js 20, TypeScript, Express, Telegraf, SQLite local mode, React/Vite Mini App, existing Jest/webapp tests, existing `.hermes/design/finance-tracker-1b-prototype.dc.html` Claude Design artifact.

---

## 0. Non-execution rule

This plan is intentionally **not** a coding task yet.

Do now:
- document decisions;
- identify task order;
- identify files likely to change;
- define Claude Code prompts and QA expectations.

Do not do now:
- no source code edits;
- no test edits;
- no route changes;
- no build/test execution except future Claude Code QA;
- no deploy;
- no secrets/token generation;
- no destructive deletion.

---

## 1. Product decisions locked for this plan

### 1.1 Product thesis

```text
Finance Tracker = API-first AI Quick Capture for personal finance.
```

Daily product promise:

```text
Сказал / написал расход → система поняла → сохранила → при необходимости дала быстро исправить.
```

### 1.2 Main references

| Reference | What to take | What not to copy |
|---|---|---|
| SyncSpend | low friction, shortcuts mindset, fast capture, minimal UI | exact screens, brand, wording, assets |
| Qalta AI | voice-first, scan/text/manual entry points, AI draft preview, iPhone-native feeling | native iOS scope, exact visual identity |
| Existing Finance Tracker | Telegram bot, voice/text parser, transaction storage, Mini App foundation | dashboard-first/budget/debt/premium primary UX |

### 1.3 Current design choice

Chosen Claude Design direction:

```text
1b · Say it — saved
```

Saved artifacts:

```text
.hermes/design/finance-tracker-1b-prototype.dc.html
.hermes/design/finance-tracker-capture-directions.dc.html
.hermes/design/support.js
```

Design details to preserve:
- dark-first UI with light pair;
- big voice capture card/button;
- bottom dock: `Scan / Voice / Manual`;
- text input fallback;
- text input active state with keyboard-safe layout;
- text submitting/parsing state with no fake save before API result;
- manual add fallback as secondary flow;
- microphone permission denied fallback to text;
- large “spent today” numeric feedback;
- compact recent transaction list;
- AI draft bottom sheet;
- partial save behavior for multi-item parses;
- old features hidden under More/off state.

---

## 2. Global development workflow

### 2.1 Roles

| Role | Responsibility |
|---|---|
| Hermes | scope, plan, prepare Claude Code prompt, launch Claude Code, inspect final report/diff, commit/push after verification |
| Claude Code | implementation, tests, build, screenshots, visual QA, self-review, final implementation report |
| User/Shukur | approve plan, choose product decisions, test iPhone/Telegram flows when needed |

### 2.2 Hard rule

```text
Claude Code does coding + QA.
Hermes does orchestration + final verification.
```

If Claude Code is unavailable:
- stop;
- report blocker;
- do not switch to Hermes implementation unless user explicitly allows it for that specific task.

### 2.3 Recommended Claude Code mode

For implementation slices:

```bash
claude -p '<task brief>' --max-turns 20
```

Use `workdir`:

```text
/home/shukur/dev/projects/finance-tracker-backend
```

Claude Code must not commit or push unless explicitly allowed inside a task. Default:

```text
Claude Code: modify files + run QA + report.
Hermes: final-check + commit/push.
```

---

## 3. High-level implementation roadmap

```text
Phase A — Read-only audit and final task decomposition
Phase B — API contract + Quick Capture backend boundary
Phase C — Telegram uses Quick Capture boundary
Phase D — Mini App design-system foundation
Phase E — Mini App Home/Capture implementation
Phase F — Capture states: listening, draft, saved, review, offline
Phase G — History + More simplification
Phase H — iPhone Shortcut MVP documentation/test recipe
Phase I — Optional direct Shortcut API after auth decision
```

Important ordering:
- Backend quick capture boundary should come before connecting all clients.
- UI design-system primitives should come before refactoring many screens.
- Direct Shortcut API should wait until auth/token/security is approved.

---

## 4. Phase A — Read-only Claude Code audit

### Task A1: Current implementation audit

**Objective:** Ask Claude Code to inspect the existing backend/frontend and produce a precise implementation map before any coding.

**Files to inspect:**
- `src/delivery/web/express/expressServer.ts`
- `src/modules/voiceProcessing/application/processTextInput.ts`
- `src/modules/voiceProcessing/application/processVoiceInput.ts`
- `src/modules/transaction/application/createTransaction.ts`
- `src/modules/transaction/domain/transactionEntity.ts`
- `src/modules/transaction/domain/transactionRepository.ts`
- `src/modules/transaction/presentation/controllers/transactionController.ts`
- `src/delivery/messaging/telegram/handlers/messageHandlers.ts`
- `webapp/src/pages/home/ui/HomePage.tsx`
- `webapp/src/features/quick-add/ui/QuickAddForm.tsx`
- `webapp/src/features/quick-add/ui/QuickAddSheet.tsx`
- `webapp/src/shared/ui/bottom-nav.tsx`
- `webapp/src/shared/lib/design-tokens.ts`
- `webapp/src/app/styles/globals.css`
- `webapp/src/app/router/routes.tsx`

**Claude Code prompt:**

```text
You are working in /home/shukur/dev/projects/finance-tracker-backend.

READ-ONLY TASK. Do not edit files. Do not run git commit/push.

Goal: audit the current repo for implementing the API-first AI Quick Capture pivot.

Read:
- .hermes/plans/2026-09-02_130400-api-first-quick-actions-spec.md
- .hermes/design/finance-tracker-1b-prototype.dc.html
- backend files around Express, voiceProcessing, transaction creation, Telegram handlers
- webapp files around Home, quick-add, bottom nav, design tokens, routes

Return a report with:
1. Proposed exact backend files to create/modify for quickCapture boundary.
2. Proposed exact frontend files to create/modify for 1b Home/Capture UI.
3. Existing tests that can be extended.
4. New tests needed.
5. Risks/blockers.
6. Recommended first coding slice, small enough for one PR/commit.

Do not change code.
```

**Expected output:** Markdown report from Claude Code.

**Hermes final check:** verify report names exact paths and does not propose broad rewrite.

---

## 5. Phase B — API contract + Quick Capture backend boundary

### Task B1: Add API contract documentation only

**Objective:** Document the exact quick capture API before code.

**Likely files:**
- Create or modify: `docs/API.md` or `docs/QUICK_CAPTURE_API.md`
- Reference: `.hermes/plans/2026-09-02_130400-api-first-quick-actions-spec.md`

**Contract to document:**

```http
POST /api/quick-capture
Content-Type: application/json
Authorization: existing Mini App/Telegram auth for P0
```

Request:

```json
{
  "text": "такси 18к",
  "source": "telegram | miniapp | ios_shortcut",
  "occurredAt": "2026-09-02T13:04:00+05:00",
  "clientRequestId": "optional-idempotency-key"
}
```

Response statuses:

```text
saved
needs_review
draft
no_transaction
error
```

Response shape:

```json
{
  "status": "saved",
  "transactions": [
    {
      "id": "...",
      "amount": 18000,
      "type": "expense",
      "semanticType": "expense",
      "description": "такси",
      "category": "transport",
      "date": "2026-09-02",
      "confidence": 0.95,
      "needsReview": false
    }
  ],
  "ack": {
    "title": "Записал",
    "summary": "Такси · 18 000 сум",
    "actions": ["edit", "delete"]
  },
  "review": {
    "reasons": []
  }
}
```

**Claude Code QA:**
- docs only;
- no build required unless repo docs validation exists;
- self-review for consistency with spec.

**Hermes final check:** ensure no secrets and no implementation started.

---

### Task B2: Add failing tests for Quick Capture service

**Objective:** Define behavior before implementation.

**Likely files:**
- Create: `src/modules/quickCapture/application/quickCaptureService.test.ts`
- Create later: `src/modules/quickCapture/application/quickCaptureService.ts`

**Test scenarios:**
1. `такси 18к` saves one expense.
2. `получил зарплату 12 млн` saves income.
3. `перевел 500к на копилку` becomes transfer/saving semantic type or `needsReview`, depending existing semantic support.
4. Multi-item input can return multiple detected transactions.
5. Empty/no transaction returns `no_transaction` without write.
6. Ambiguous low-confidence parse returns `needs_review` or draft.

**Important:** preserve existing conservative parsing safeguards. No fast-path regression for transfers/savings/cash withdrawal.

**Expected first run:** tests fail because service does not exist.

**Claude Code QA:**

```bash
npm run test:ci -- src/modules/quickCapture/application/quickCaptureService.test.ts
```

Expected before implementation:

```text
FAIL: module/service not found or expected method missing
```

---

### Task B3: Implement minimal Quick Capture service

**Objective:** Create a shared application boundary that all clients can use.

**Likely files:**
- Create: `src/modules/quickCapture/application/quickCaptureService.ts`
- Create: `src/modules/quickCapture/domain/quickCaptureTypes.ts`
- Create: `src/modules/quickCapture/quickCaptureModule.ts`
- Modify: module wiring where app currently constructs modules, likely `src/index.ts` or equivalent bootstrap file.

**Service responsibilities:**
- accept text + source + user context;
- call existing text analysis/parsing;
- create transactions through `CreateTransactionUseCase`;
- return compact payload for Telegram/Mini App/Shortcut;
- avoid duplicating parser logic;
- support `source` metadata if current entity permits, otherwise do not force schema changes in first slice.

**Do not:**
- rewrite parser;
- remove old voiceProcessing;
- add production auth;
- add Supabase changes;
- delete budget/debt/dashboard modules.

**Claude Code QA:**

```bash
npm run test:ci -- src/modules/quickCapture/application/quickCaptureService.test.ts
npm run build
```

Expected:

```text
PASS quickCaptureService tests
TypeScript build passes
```

---

### Task B4: Add Express endpoint

**Objective:** Expose the shared service via API.

**Likely files:**
- Create: `src/modules/quickCapture/presentation/controllers/quickCaptureController.ts`
- Modify: `src/delivery/web/express/expressServer.ts`
- Modify: `src/index.ts` or app bootstrap to construct/inject module.
- Test: `src/modules/quickCapture/presentation/controllers/quickCaptureController.test.ts` or existing web route test pattern.

**Endpoint:**

```http
POST /api/quick-capture
```

Note: current `buildServer` mounts routers without `/api` prefix inside `expressServer.ts`; Claude Code must inspect bootstrap to confirm actual public prefix. Do not guess.

**Security P0:**
- use existing user resolution/auth pattern if available;
- no unauthenticated writes;
- if local/dev guest user exists, document clearly.

**Claude Code QA:**

```bash
npm run test:ci
npm run build
```

Expected:

```text
route tests pass
backend build passes
```

---

## 6. Phase C — Telegram uses Quick Capture boundary

### Task C1: Route Telegram text input through Quick Capture service

**Objective:** Telegram becomes a client of the same quick capture logic.

**Likely files:**
- Modify: `src/delivery/messaging/telegram/handlers/messageHandlers.ts`
- Modify: `src/delivery/messaging/telegram/formatters/transactionFormatter.ts`
- Maybe modify: `src/delivery/messaging/telegram/i18n/ru.ts`
- Tests: existing Telegram handler tests or create focused test if pattern exists.

**Desired Telegram ack:**

```text
✅ Записал
Такси · 18 000 сум
[Изменить] [Удалить]
```

For review:

```text
Нужно уточнить
“перевел 500к” — это перевод себе или расход?
```

**Rules:**
- keep typing/loading/ack behavior;
- preserve existing semantic safeguards;
- don't print secrets;
- no broad command redesign.

**Claude Code QA:**

```bash
npm run test:ci
npm run build
```

Manual/local if available:
- simulate handler input without real Telegram if tests support it;
- otherwise report limitation.

---

### Task C2: Keep Telegram voice compatible

**Objective:** Voice flow should still work and ideally share quick capture result formatting.

**Likely files:**
- Modify: `src/modules/voiceProcessing/application/processVoiceInput.ts`
- Modify: Telegram voice handler path if separate.

**Decision:** do not rewrite transcription. Only unify post-transcription handling if safe.

**Claude Code QA:**
- existing voice tests;
- no real OpenAI call in tests;
- mocks only.

---

## 7. Phase D — Mini App design-system foundation

### Task D1: Extract design tokens from Claude Design artifact

**Objective:** Convert selected 1b tokens into repo design primitives.

**Source artifact:**

```text
.hermes/design/finance-tracker-1b-prototype.dc.html
```

**Likely files:**
- Modify: `webapp/src/shared/lib/design-tokens.ts`
- Modify: `webapp/src/app/styles/globals.css`
- Maybe create: `webapp/src/shared/ui/page-shell.tsx`
- Maybe create: `webapp/src/shared/ui/amount-text.tsx`

**Dark tokens from artifact:**

```text
bg #0A0A0B
surface #141417
raised #1C1D21
inset #0E0F11
hairline rgba(255,255,255,.08)
hairline-soft rgba(255,255,255,.06)
text #F5F5F6
muted #8C8D93
dim #5E5F65
primary-fill #F5F5F6
on-primary #0A0A0B
income #4CC38A
expense #F2725E
review #E8A33D
```

**Light tokens from artifact:**

```text
bg #F7F6F3
surface #FFFFFF
raised #F4F3EF
inset #F4F3EF
hairline #E7E5E0
soft #F0EEE9
text #14151A
muted #71747B
dim #9B9A94
primary-fill #14151A
on-primary #FFFFFF
income #1F7A4C
expense #C4453B
review #C77A17
```

**Typography:**
- UI: IBM Plex Sans or existing Cyrillic-friendly font if repo constraints prefer existing `Onest`;
- Numbers: IBM Plex Mono or existing numeric treatment;
- if adding fonts is risky, keep current font but preserve hierarchy/spacing.

**Claude Code QA:**

```bash
cd webapp && npm run build
cd webapp && npm run test
```

Expected:

```text
webapp build/tests pass
```

---

### Task D2: Create shared UI primitives

**Objective:** Add reusable primitives before page rewrite.

**Likely files:**
- Create: `webapp/src/shared/ui/page-shell.tsx`
- Create: `webapp/src/shared/ui/amount-text.tsx`
- Create: `webapp/src/shared/ui/review-badge.tsx`
- Modify: `webapp/src/shared/ui/index.ts`

**Components:**
- `PageShell`
- `AmountText`
- `ReviewBadge`
- maybe `SectionLabel`

**Acceptance:**
- no product behavior change yet;
- existing pages still compile;
- components have simple tests if current webapp test setup supports component tests.

---

## 8. Phase E — Mini App Home/Capture implementation

### Task E1: Build `QuickCaptureCard` and `TextCaptureInput`

**Objective:** Implement the main capture UI as standalone components.

**Likely files:**
- Create: `webapp/src/features/quick-capture/ui/QuickCaptureCard.tsx`
- Create: `webapp/src/features/quick-capture/ui/TextCaptureInput.tsx`
- Create: `webapp/src/features/quick-capture/index.ts`
- Test: `webapp/src/features/quick-capture/ui/QuickCaptureCard.test.tsx` if test setup supports it.

**Behavior P0:**
- card/button shows “Скажите — сохранено”;
- examples chips visible;
- text input accepts natural text;
- submitting text calls callback; no API integration in first UI slice unless Phase B is done.

**No backend coupling yet:** if backend endpoint not ready, use existing quick-add callback or mocked handler.

**Claude Code QA:**

```bash
cd webapp && npm run build
cd webapp && npm run test
```

---

### Task E2: Build `BottomActionDock`

**Objective:** Replace dashboard nav emphasis with action-first dock.

**Likely files:**
- Create: `webapp/src/shared/ui/bottom-action-dock.tsx`
- Modify or later replace: `webapp/src/shared/ui/bottom-nav.tsx`

**Dock actions:**

```text
СКАН | ГОЛОС | ВРУЧНУЮ
```

**P0 behavior:**
- voice is visually primary;
- scan can be disabled/placeholder;
- manual opens text/manual add;
- hit targets >= 44px;
- safe-area bottom handled.

**Visual QA:**
- 375px: no wrapping;
- 390px: matches design artifact;
- 412px: comfortable spacing.

---

### Task E3: Rebuild Home page around capture

**Objective:** Home becomes quick capture first, not dashboard.

**Likely files:**
- Modify: `webapp/src/pages/home/ui/HomePage.tsx`
- Modify: `webapp/src/widgets/recent-transactions/ui/RecentTransactions.tsx`
- Maybe modify: `webapp/src/widgets/balance-card/ui/BalanceCard.tsx` only if still used.

**Home order:**

```text
date/status
spent today amount
QuickCaptureCard
TextCaptureInput
Recent transactions
BottomActionDock
```

**Remove from first viewport:**
- charts;
- budget overview;
- premium cards;
- analytics blocks;
- trust summary if it competes with capture.

**Claude Code QA:**

```bash
cd webapp && npm run build
cd webapp && npm run test
```

Screenshot QA:
- 375 width Home/Capture;
- 390 width Home/Capture;
- 412 width Home/Capture;
- dark mode;
- light mode if implemented.

Claude Code must attach screenshot paths in report.

---

## 9. Phase F — Capture states

### Task F1: Implement listening state UI

**Objective:** Voice action should show clear “listening/processing” state.

**Likely files:**
- Create/modify: `webapp/src/features/quick-capture/ui/ListeningOverlay.tsx`
- Modify: `QuickCaptureCard.tsx`

**State:**

```text
слушаю
«recognized phrase preview»
Отмена
```

**Rules:**
- subtle motion;
- respect reduced motion;
- no fake success until result arrives.

---

### Task F2: Implement AI draft preview bottom sheet

**Objective:** Match Qalta-like parse preview.

**Likely files:**
- Create: `webapp/src/features/quick-capture/ui/CapturePreviewCard.tsx`
- Create: `webapp/src/features/quick-capture/ui/CapturePreviewCard.test.tsx`

**Content:**
- recognized text;
- parsed transactions;
- confidence;
- review marker;
- actions: `Отмена`, `Уточнить`, `Сохранить N`.

**Acceptance:**
- 3-button row does not wrap at 375px;
- sheet max height <= 78%;
- internal scroll if needed;
- primary save remains visible.

---

### Task F3: Implement saved toast + undo placeholder

**Objective:** Fast confirmation without a full screen.

**Likely files:**
- Create: `webapp/src/features/quick-capture/ui/CompactToast.tsx`

**Toast examples:**

```text
Сохранено · −53 000 сум
Сохранено 2 · 1 к проверке
```

**P0:** undo can be visual only if delete endpoint not wired yet; must be honest in code/report.

---

### Task F4: Implement review/offline states

**Objective:** Preserve trust when AI/network is uncertain.

**Likely files:**
- Create: `webapp/src/features/quick-capture/ui/ReviewPrompt.tsx`
- Create: `webapp/src/features/quick-capture/ui/OfflineQueueBanner.tsx`

**States:**
- “Нужна проверка” for ambiguous amount/category/transfer;
- “Нет сети — пишем локально” if offline queue exists or is future placeholder.

**Important:** if offline queue is not technically implemented, label as placeholder/future and do not fake persistence.

---

## 10. Phase G — History + More simplification

### Task G1: Simplify History for recent corrections

**Objective:** History supports fast review/correction, not analytics.

**Likely files:**
- Modify: `webapp/src/pages/transactions/ui/TransactionsPage.tsx`
- Modify: `webapp/src/entities/transaction/ui/TransactionListItem.tsx`
- Maybe modify: `webapp/src/features/filter-transactions/ui/FilterBar.tsx`

**Requirements:**
- recent-first;
- search/filter only if already exists and does not clutter;
- transaction rows use new compact style;
- review items clearly marked.

---

### Task G2: Move old features under More/disabled

**Objective:** Budgets/debts/analytics/premium should not be primary UX.

**Likely files:**
- Modify: `webapp/src/shared/ui/bottom-nav.tsx`
- Modify: `webapp/src/pages/more/ui/MorePage.tsx`
- Modify: `webapp/src/app/router/routes.tsx`
- Modify: `webapp/src/shared/lib/constants/routes.ts`

**Rules:**
- do not delete routes first;
- hide from bottom nav;
- More page can show “выкл/скоро” state;
- opened direct routes should not crash.

**Claude Code QA:**
- route smoke checks if available;
- screenshot More page;
- ensure no dashboard/budget cards on Home.

---

## 11. Phase H — iPhone Action Button / Shortcut MVP

### Task H1: Write Shortcut setup guide, no direct API yet

**Objective:** Let Shukur trigger capture from Action Button via Apple Shortcut and Telegram/manual path.

**Likely files:**
- Create: `docs/IOS_SHORTCUT_ACTION_BUTTON.md`

**MVP flow:**

```text
Action Button
→ Shortcut asks “Что потратил?”
→ user dictates/types text
→ Shortcut copies text and opens Telegram bot OR opens prepared Telegram URL if supported
→ user sends
→ Telegram quick capture handles it
```

**Do not include secrets.**

**Need real-device verification by Shukur:**
- Hermes/Claude Code cannot fully verify iPhone Action Button from WSL.
- Plan must include user confirmation checklist.

---

## 12. Phase I — Optional direct Shortcut API

Do not implement until separately approved.

### Required decisions before Phase I

- public URL/tunnel approach;
- token auth format;
- revocation UI/location;
- rate limit;
- logging redaction;
- whether created transaction sends Telegram notification.

### Likely future files

- Backend:
  - `src/modules/quickCapture/presentation/controllers/quickCaptureController.ts`
  - auth middleware for shortcut token;
  - token storage/repository if needed.
- Docs:
  - `docs/IOS_SHORTCUT_DIRECT_API.md`

### Security rules

- token is not bot token;
- token is not OpenAI key;
- token is scoped to one user quick-capture only;
- token is never printed;
- invalid token returns 401/403;
- no deploy without explicit approval.

---

## 13. Claude Code QA contract for every coding slice

Claude Code must return this report format after every slice:

```markdown
## Summary
- What changed
- Why

## Files changed
- path: short explanation

## Tests run
- command
- result

## Screenshots / Visual QA
- viewport 375: path/result
- viewport 390: path/result
- viewport 412: path/result
- notes

## Scope check
- Confirmed no budgets/debts/analytics expansion
- Confirmed no deploy/secrets
- Confirmed no commit/push

## Risks / follow-up
- Known limitations
- Next recommended slice
```

For backend-only slices, screenshot section can say:

```text
Not applicable: backend-only slice.
```

For frontend slices, screenshots are mandatory.

---

## 14. Hermes final verification checklist

Hermes checks after Claude Code finishes:

- [ ] Claude Code did not commit/push.
- [ ] Diff matches the approved slice.
- [ ] No secrets/tokens printed or added.
- [ ] No deploy/Supabase/native iOS work.
- [ ] Old features are hidden, not deleted, unless explicitly approved.
- [ ] Tests claimed by Claude Code have real output.
- [ ] Screenshot paths exist for frontend slices.
- [ ] UI still follows 1b design direction.
- [ ] If OK: Hermes commits/pushes.
- [ ] If not OK: Hermes sends a fix brief back to Claude Code.

---

## 15. First execution slice recommendation

When Shukur says “начинай”, do **not** start with UI immediately.

Recommended first slice:

```text
Phase A / Task A1 — Claude Code read-only audit
```

Why:
- confirms exact current file wiring;
- reduces risk before code changes;
- lets Claude Code decide safest first implementation path from actual code;
- aligns with the new rule: Claude Code does dev + QA.

Recommended second slice:

```text
Phase B1 — API contract docs
```

Recommended third slice:

```text
Phase B2/B3 — quickCapture service tests + minimal service
```

Only after backend boundary is clear:

```text
Mini App 1b Home/Capture UI
```

Reason: UI should eventually call the same API/service. If UI is done first, we risk making another isolated quick-add flow.

---

## 16. Open questions before coding

Need Shukur decisions before implementation:

1. Endpoint naming:
   - `POST /api/quick-capture`
   - or `/api/quick-actions/capture`

   Recommendation: `POST /api/quick-capture` for simplicity.

2. First visible UI theme:
   - dark-first only;
   - or dark + light pair from day one.

   Recommendation: dark-first P0, light pair P1 unless implementation is cheap.

3. Scan button in P0:
   - visible disabled placeholder;
   - or hidden until scan exists.

   Recommendation: visible but clearly placeholder/disabled if it helps preserve Qalta-like dock; otherwise hide to avoid fake feature.

4. Auto-save confidence threshold:
   - 0.90 from Claude Design;
   - or always preview first in Mini App P0.

   Recommendation: Telegram can auto-save obvious inputs; Mini App can preview ambiguous/multi-item. Start conservative if uncertain.

5. Direct Shortcut API:
   - P2 after Telegram Shortcut MVP;
   - or earlier.

   Recommendation: defer until token/auth story is explicit.

---

## 17. Definition of Done for this plan

The full pivot plan is ready when:

- [x] Product direction documented.
- [x] Claude Design artifact saved in repo.
- [x] Updated Claude Design artifact includes required missing states: text active, text parsing, manual fallback, mic denied.
- [x] Claude Code-only implementation/QA workflow documented.
- [x] Existing repo retained; no new project recommended.
- [x] First implementation order defined.
- [ ] Shukur approves endpoint name.
- [ ] Shukur approves first execution slice.
- [ ] Claude Code read-only audit completed.

---

## 18. Next session handoff

Use this section when Shukur starts a new Hermes session.

### Current status

```text
Planning/design stage complete.
Do not start implementation unless Shukur explicitly says to begin.
```

Completed and saved in repo:

```text
.hermes/plans/2026-09-02_130400-api-first-quick-actions-spec.md
.hermes/plans/2026-09-02_162423-quick-capture-claude-code-implementation-plan.md
.hermes/design/finance-tracker-1b-prototype.dc.html
.hermes/design/finance-tracker-capture-directions.dc.html
.hermes/design/support.js
```

Latest design artifact includes 13 states:

```text
01. Home / Capture
02. Voice listening
03. AI draft / parsed preview
04. Saved confirmation
05. Needs review
06. History
07. Empty state
08. Offline / queue
09. More / Settings
10. Text input active / keyboard
11. Text submitting / parsing
12. Manual add fallback
13. Microphone permission denied
```

### Locked workflow

```text
Claude Code = implementation + QA/tests/screenshots.
Hermes = orchestrator + final verifier + commit/push.
```

Hermes must not implement code directly unless Shukur explicitly allows it.

### First thing to do when implementation starts

Start with a Claude Code **read-only audit**:

```text
Phase A / Task A1 — Current implementation audit
```

Claude Code should read the repo/spec/design artifacts and return a precise implementation map. It must not edit code in that first audit.

### Suggested first prompt for Claude Code

```text
You are working in /home/shukur/dev/projects/finance-tracker-backend.

READ-ONLY TASK. Do not edit files. Do not run git commit/push.

Goal: audit the current repo for implementing the API-first AI Quick Capture pivot.

Read:
- .hermes/plans/2026-09-02_130400-api-first-quick-actions-spec.md
- .hermes/plans/2026-09-02_162423-quick-capture-claude-code-implementation-plan.md
- .hermes/design/finance-tracker-1b-prototype.dc.html
- .hermes/design/finance-tracker-capture-directions.dc.html
- backend files around Express, voiceProcessing, transaction creation, Telegram handlers
- webapp files around Home, quick-add, bottom nav, design tokens, routes

Return a report with:
1. Proposed exact backend files to create/modify for quickCapture boundary.
2. Proposed exact frontend files to create/modify for 1b Home/Capture UI.
3. Existing tests that can be extended.
4. New tests needed.
5. Risks/blockers.
6. Recommended first coding slice, small enough for one commit.

Do not change code.
```

### Defaults if Shukur does not decide otherwise

```text
Endpoint: POST /api/quick-capture
Theme: dark-first P0, light pair P1 if cheap
Scan: visible disabled/soon placeholder only if honest
Auto-save: obvious Telegram inputs can auto-save; ambiguous/multi-item inputs preview/review
Direct Shortcut API: P2 after auth/token decision
```

---

## 19. Important non-goals repeated

Do not let future tasks drift into:

- Aurum-like finance OS;
- budgets expansion;
- debts expansion;
- analytics/dashboard redesign;
- premium/subscription work;
- native iOS app;
- Apple Wallet automation;
- Supabase/production deploy;
- deleting stable modules;
- pixel-perfect cloning of SyncSpend/Qalta.

The product must stay centered on:

```text
fast capture → correct parse → save/review → quick correction
```
