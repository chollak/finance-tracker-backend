# UI/Product Improvements Roadmap — Finance Tracker Mini App

Date: 2026-07-22
Owner: Hermes QA gatekeeper; Claude Code as implementation agent

## Product thesis

Move the Mini App from a module dashboard to a Telegram-native financial assistant.

The UI should answer three human questions first:

1. How much did I spend?
2. Where am I close to or over limit?
3. What needs attention now?

## Design stance

- Mobile-first Telegram Mini App.
- Minimal, clean, rounded, neutral + one accent.
- Prefer insight-first cards over generic admin widgets.
- Keep implementation incremental and safe: no backend/API/schema changes unless explicitly scoped.

## Non-goals for this UI phase

- No production deploy.
- No real data migration.
- No account/card balance model yet.
- No broad visual redesign of every component in one slice.
- No GitHub Issues creation unless Shukur explicitly asks.

## Tasks

### FT-027A — Insight-first home and balance terminology

Status: done
Owner: Claude Code, QA by Hermes
Priority: P0
Type: frontend-ui

Problem:
The current `BalanceCard` labels `netIncome` as `Баланс`, which can imply real card/account balance. The Home page is data-first instead of insight-first.

Scope:
- `webapp/src/pages/home/ui/HomePage.tsx`
- `webapp/src/widgets/balance-card/**`
- small shared formatting/helper files if needed

Required changes:
- Rename user-facing copy from `Баланс` to a clearer term such as `Итог за месяц`, `Чистый поток`, or `Доходы − расходы`.
- Make it explicit that this is not real card balance.
- Add a compact insight-first section/card on Home using existing dashboard data only.
- Preserve quick add actions for income/expense.
- Keep visual style aligned with `docs/knowledge-base/10-design-guidelines/design-guidelines.md`.

Definition of Done:
- Home page first screen has clearer product hierarchy.
- User-facing text no longer implies `netIncome` is card balance.
- No backend/API/schema/env/package/deploy changes.
- `npm run build:webapp` passes.
- `npm run verify` passes or any blocker is reported precisely.

Result:
- Added `AttentionSummary` on Home.
- Renamed `Баланс` to `Чистый поток за месяц`.
- Verification passed via `npm run build:webapp` and `npm run verify`.

### FT-027B — Actionable budget remaining UX

Status: done
Owner: Claude Code, QA by Hermes
Priority: P1
Type: frontend-ui

Problem:
Budget cards show progress percentage, but not enough actionable meaning.

Required changes:
- Show `Осталось X` or `Перерасход X` prominently.
- For period-aware budgets, prefer copy like `до конца недели/месяца` where data already exists.
- Do not invent recurring-budget backend logic; use current fields only.

FT-027B result:
- Budget cards now emphasize `Осталось X` or `Перерасход X`.
- Time context uses existing period/daysRemaining fields.
- `BudgetOverview` reuses the same budget view model.
- Verification passed via `npm run build:webapp` and `npm run verify`.

### FT-027C — Mobile add CTA and bottom navigation review

Status: ready
Owner: Claude Code, QA by Hermes
Priority: P1
Type: frontend-ui

Problem:
Adding a transaction is the core action, but it is split between FAB/card/page patterns.

Required changes:
- Propose/implement a consistent mobile CTA pattern.
- Avoid FAB overlap with bottom nav/safe area.
- Keep routes stable unless necessary.

### FT-027D — Simplify transaction archive surface

Status: ready
Owner: Claude Code, QA by Hermes
Priority: P2
Type: frontend-ui

Problem:
`Archive` is visible as a primary transaction concept. It may be too technical for MVP users.

Required changes:
- Keep functionality if already implemented.
- Reduce visual prominence or move dangerous/bulk action lower.
- Improve copy if needed.

### FT-027E — Browser/screenshot UI QA

Status: ready
Owner: Claude Code or Hermes, QA by Hermes
Priority: P2
Type: qa

Problem:
Current review was code-level; we still need screenshot/pixel-level Telegram Mini App review.

Required checks:
- Home, Transactions, Budgets, Add Transaction, Add Budget on mobile viewport.
- Console/network errors.
- Visual hierarchy, bottom nav, keyboard/safe area issues.
- Report screenshots or blocker if browser tooling unavailable.

## Delegation policy

- Claude Code implements one slice at a time.
- Claude Code must not commit/push.
- Hermes reviews diff, runs focused and full verification, updates task docs, then commits/pushes.
