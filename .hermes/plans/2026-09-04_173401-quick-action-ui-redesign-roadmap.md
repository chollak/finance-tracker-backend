# Quick Action UI Redesign Roadmap

> **For Hermes:** Use Claude Code for implementation and screenshot QA. Hermes orchestrates, final-checks real screenshots/diff/tests, updates `TASKS.md`, then commits/pushes. Do not implement broad backend/product work in UI slices.

**Goal:** Redesign the Mini App around quick action / quick capture as the primary product loop, while keeping budgets/debts/analytics/premium hidden or secondary instead of deleting working code.

**Architecture:** Keep the existing React/Vite Mini App and shipped `POST /api/quick-capture` boundary. Redesign incrementally: Home/Capture posture first, then dock/history/more, then theme/system. Every frontend slice needs tests/build and screenshots at 375/390/412.

**Tech Stack:** Existing repo: React, TypeScript, Vite, Tailwind/CSS variables, Onest self-hosted, Playwright screenshot audit via `npm run design:audit`, full gate via `npm run verify`.

---

## 1. Current UI diagnosis

Audit sources:

- `TASKS.md` and `CLAUDE.md` after non-quick-action tasks moved to backlog.
- `.hermes/plans/2026-09-02_130400-api-first-quick-actions-spec.md`.
- `.hermes/plans/2026-09-02_162423-quick-capture-claude-code-implementation-plan.md`.
- Claude Design artifacts: `.hermes/design/finance-tracker-1b-prototype.dc.html`, `.hermes/design/finance-tracker-capture-directions.dc.html`.
- Current screenshots from `npm run design:audit` at 390px:
  - `/tmp/quick-action-redesign-audit/screenshots/home-390.png`
  - `/tmp/quick-action-redesign-audit/screenshots/transactions-390.png`
  - `/tmp/quick-action-redesign-audit/screenshots/more-390.png`

### Main problem

The app is no longer dashboard-first on Home, but it still visually feels like a **form/card CRUD app** instead of a **quick action utility**.

Specific issues:

1. **Home has equal-weight cards.** Quick Capture, Recent, and Attention use the same card language; the primary action is not dominant enough.
2. **No “spent today” anchor.** The selected design direction expects a large daily feedback number; current Home jumps from date/status straight into a form.
3. **Capture card is too wordy.** It explains scan/voice/text, shows examples, helper copy and submit controls all in one large card. The honesty is right, but the volume is high.
4. **Global dock still says navigation + plus.** The center `+` opens the older manual `QuickAddSheet`, so the most prominent action still leads to the slowest flow.
5. **Two capture flows compete.** AI `quick-capture` is the product direction, but manual `quick-add` still has prominent entry points.
6. **History feels like management.** Tabs, filters, archive and bulk hiding are useful, but too admin-like for the daily correction loop.
7. **More is only old feature links.** It hides budgets/debts/analytics, but does not yet explain the quick-action setup/channels.
8. **Light-only vs chosen dark-first direction.** The repo is light-only today; dark-first is desirable but a large separate slice.
9. **No fake capabilities allowed.** Scan, Mini App voice and offline queue are not implemented; redesigned UI must not imply they work.

---

## 2. Product/IA decision for the redesign

Current product focus:

```text
fast capture → correct parse → save/review → quick correction
```

Primary Mini App routes:

```text
Home / Capture
History
More / Settings
```

Hidden/deprioritized from daily path, but not deleted:

- Budgets
- Debts
- Analytics
- Premium / usage limits
- Complex dashboard / financial health

### More page structure

More should become a secondary hub:

1. **Каналы записи**
   - Telegram bot
   - iPhone Shortcut / Action Button
   - Mini App text capture
   - Scan: soon / unavailable
2. **Настройки**
   - local settings that actually exist or can be implemented safely
3. **Не каждый день**
   - Budgets
   - Debts
   - Analytics

Do not mark working features as “off” or broken. Label them honestly as secondary / not daily.

---

## 3. Design system direction

Surface archetype: **Command / Inspect mobile utility**.

Meaning:

- One main action dominates.
- Everything else supports correction/review.
- No hero marketing, no dense dashboard, no admin tables.

Visual posture:

- Calm mobile finance utility.
- Soft light theme first unless Shukur explicitly approves dark-first as P0.
- One primary action, one important number.
- Minimal iconography.
- Semantic colors only for financial/destructive/warning meaning.
- Onest remains the UI font; do not reintroduce remote fonts.
- Use tabular numeric styling for amounts.

Recommended theme decision:

```text
P0: light-first redesign using current token system.
P1: dark theme pair as a separate slice.
```

Reason: current repo is explicitly light-only and dark theme would touch many surfaces. Capture posture gives more value first.

---

## 4. Target screens

### Home / Capture

Target hierarchy:

```text
[date/status]                         [History] [More]

ПОТРАЧЕНО СЕГОДНЯ
185 000 сум
3 операции · последняя 14:20

[primary capture card]
Скажите — сохранено
text input fallback
examples / hints are compact

ПОСЛЕДНИЕ
compact transaction rows

[bottom capture dock]
```

Home must not show above the fold:

- budgets
- analytics
- premium
- financial health
- trust formula
- dense charts

### Capture dock

Two acceptable options:

#### Option A — honest action dock, recommended

```text
[Чек: скоро] [Записать] [Вручную]
```

- Center action focuses text capture / primary quick capture.
- Voice remains explained as “voice works in Telegram chat” until real Mini App voice exists.
- Manual opens existing `QuickAddSheet` as fallback.

#### Option B — reference-like dock

```text
[Чек] [Голос] [Вручную]
```

Only acceptable if `Голос` clearly opens an explanation and does not pretend to record in the Mini App.

### History

Daily correction list, not management console:

- recent-first
- day grouping
- day total
- compact rows
- search/filter quieter
- archive/bulk actions behind secondary menu
- row actions remain reachable

### More

- Capture channels first.
- Secondary features grouped as “Не каждый день”.
- No premium upsell in primary path.

### States

Required states:

- empty
- loading
- submitting / parsing
- saved
- needs review
- offline
- guest
- scan unavailable
- Mini App voice unavailable

Hard rule: no fake offline queue, no fake scanner, no fake recorder.

---

## 5. Implementation slices

### FT-077: Home today-spend hero

Status: ready
Priority: high
Type: quick-action-ui

Objective: Add the missing daily feedback anchor above Quick Capture.

Likely files:

- Create: `webapp/src/widgets/today-total/lib/todayTotal.ts`
- Create: `webapp/src/widgets/today-total/lib/todayTotal.test.ts`
- Create: `webapp/src/widgets/today-total/ui/TodayTotal.tsx`
- Create: `webapp/src/widgets/today-total/index.ts`
- Modify: `webapp/src/pages/home/ui/HomePage.tsx`

Rules:

- Count **real expenses only**.
- Exclude own transfers, savings deposits, cash withdrawals, debts and `needsReview` from “spent today”.
- No new backend endpoint in this slice.
- No budgets/analytics/debts on Home.

Verification:

- `npm run test:webapp`
- `npm run build:webapp`
- `npm run verify`
- screenshots: Home at 375/390/412 with seeded data or disposable QA rows.

### FT-078: Quick Capture card visual redesign

Status: backlog
Priority: high
Type: quick-action-ui

Objective: Make the card feel like the primary capture action, not a long explanatory form.

Likely files:

- Modify: `webapp/src/features/quick-capture/ui/TextQuickCaptureCard.tsx`
- Maybe create: `webapp/src/features/quick-capture/ui/CaptureFeedback.tsx`
- Maybe create: `webapp/src/features/quick-capture/ui/CaptureExamples.tsx`

Rules:

- Preserve honest copy: no scanner, no Mini App voice recorder, no offline queue.
- Keep server ack details visible, but condensed.
- Do not change API contract.

Verification:

- existing quick-capture model tests remain green
- `npm run test:webapp`
- screenshots Home 375/390/412

### FT-079: Capture-first bottom dock

Status: backlog
Priority: high
Type: quick-action-ui

Objective: Replace the navigation-plus dock posture with an action-first dock.

Likely files:

- Create: `webapp/src/shared/ui/capture-dock.tsx`
- Modify: `webapp/src/shared/ui/bottom-nav.tsx`
- Modify: `webapp/src/shared/ui/layout.tsx`
- Modify: `webapp/src/pages/home/ui/HomePage.tsx`
- Modify: `webapp/src/widgets/recent-transactions/ui/RecentTransactions.tsx`

Rules:

- Do not remove routes.
- Ensure History and More remain reachable.
- Manual action may open existing `QuickAddSheet`.
- Scan/voice must be honest placeholders unless real support exists.
- Hit targets >= 44px.

Verification:

- `npm run design:audit` on Home/Transactions/More at 375/390/412
- nav/dock center metrics
- `npm run verify`

### FT-080: Compact transaction rows for recent list

Status: backlog
Priority: medium
Type: quick-action-ui

Objective: Make recent transactions scan like a quick correction log.

Likely files:

- Create/modify: `webapp/src/entities/transaction/ui/TransactionRow.tsx`
- Modify: `webapp/src/widgets/recent-transactions/ui/RecentTransactions.tsx`
- Reuse/extend: transaction display helper tests

Rules:

- Preserve edit/delete/review affordances.
- Use semantic amount colors: only real expenses are expense-red; transfers/deposits/debt/cash neutral.
- Do not rewrite the full transactions page yet.

### FT-081: History page daily-correction redesign

Status: backlog
Priority: medium
Type: quick-action-ui

Objective: Turn Transactions into History for quick correction, not admin management.

Likely files:

- Modify: `webapp/src/pages/transactions/ui/TransactionsPage.tsx`
- Modify: `webapp/src/features/filter-transactions/ui/FilterBar.tsx`
- Reuse: compact `TransactionRow`

Rules:

- Archive and bulk hide remain available but secondary.
- No new analytics.
- No route deletion.

### FT-082: More page quick-action hub

Status: backlog
Priority: medium
Type: quick-action-ui

Objective: Make More explain the quick-action setup and house non-daily features.

Likely files:

- Modify: `webapp/src/pages/more/ui/MorePage.tsx`
- Maybe create small local components under `pages/more/ui/`

Groups:

- Каналы записи
- Настройки
- Не каждый день

Rules:

- Do not render non-working settings toggles.
- Do not label working budgets/debts/analytics as disabled.

### FT-083: Remove dashboard dependency from Home

Status: backlog
Priority: medium
Type: quick-action-ui/performance

Objective: Ensure Home/Capture does not fetch heavy dashboard/budget/analytics data just to render daily capture.

Likely files:

- Modify: `webapp/src/widgets/attention-summary/ui/AttentionSummary.tsx`
- Modify: `webapp/src/shared/ui/bottom-nav.tsx`
- Maybe derive review count from transaction list query.

Rules:

- No backend change.
- No dashboard/budget cards on Home.

### FT-084: Saved toast and real undo decision

Status: backlog
Priority: medium
Type: quick-action-ui

Objective: After quick capture, show compact saved feedback; add Undo only if backed by real delete.

Likely files:

- Maybe create: `webapp/src/features/quick-capture/ui/CompactToast.tsx`
- Modify: quick-capture mutation/feedback path

Rules:

- No fake Undo.
- If Undo is added, it must call an existing delete endpoint and update caches.

### FT-085: Dark theme pair

Status: backlog
Priority: low
Type: design-system

Objective: Add dark theme matching the selected `1b · Say it — saved` direction.

Likely files:

- Modify: `webapp/src/app/styles/globals.css`
- Modify: `webapp/src/shared/lib/design-tokens.ts`
- Maybe wire `next-themes` / Telegram theme sync.

Rules:

- Separate slice only.
- Full dark/light screenshot sweep required.

---

## 6. Recommended first slice

Start with **FT-077: Home today-spend hero**.

Why:

- It is the missing first-viewport anchor from the chosen design.
- It improves quick-action feedback without changing navigation or API.
- It is testable with pure logic.
- It creates reusable semantics for later rows/history.
- It is small enough for one Claude Code implementation + QA pass.

Claude Code brief should require:

- no backend/API changes;
- no budgets/debts/analytics expansion;
- no dark theme yet;
- screenshots at 375/390/412;
- full `npm run verify`;
- no commit/push.

---

## 7. Open decisions before later slices

1. **Theme:** keep P0 light-first or switch to dark-first immediately?
2. **Dock label:** center action should be `Записать` or `Голос`?
3. **Scan:** keep visible `Скоро` placeholder or hide until real scan?
4. **Manual form:** demote to secondary `Вручную`, yes/no?
5. **Undo:** wire real delete as next UX slice or omit until dogfood proves pain?
6. **Offline:** keep “cannot submit offline” or design a real local queue later?

Default recommendations:

```text
Theme: light-first P0, dark P1
Dock center: Записать
Scan: visible but clearly Скоро
Manual: secondary fallback
Undo: only if real delete is wired
Offline: no queue claim until implemented
```
