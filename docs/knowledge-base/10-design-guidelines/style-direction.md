# Finance Tracker Style Direction

> **Архив (2026-10-16, FT-096).** Это прежнее направление (Onest, нейтральный shadcn, нижний бар). Действующая дизайн-система — «Пастель»: [`docs/pastel/design-system.md`](../../pastel/design-system.md) и [`docs/pastel/components/`](../../pastel/components/). Не использовать для новых экранов.


Date: 2026-07-22
Status: working design direction

## Product feel

Finance Tracker should feel like a calm Telegram-native financial assistant, not a colorful dashboard or admin panel.

Reference mood:

- Linear: clean structure, restrained navigation, strong spacing discipline.
- Wise/Revolut: finance clarity, direct money language, mobile-first actions.
- iOS/Telegram Mini App: native-feeling bottom navigation, obvious touch targets, no visual noise.

## Core visual thesis

**Neutral interface, semantic money colors.**

The UI shell should mostly be black/white/gray. Color appears when it carries financial meaning: income, expense, warning, success/healthy state.

This avoids a common finance-app mistake: using green for every important button, which makes `+ expense` look like a positive/success state.

## Color roles

| Role | Token direction | Use for | Do not use for |
|---|---|---|---|
| Primary action | `primary`, `foreground`, neutral surface | Submit, create, open, navigation CTA | Income/success meaning |
| Success / income | `success`, `income` green | Income, healthy budget, remaining budget, positive state | Generic primary buttons |
| Expense / destructive | `expense`, `destructive` red | Expenses, delete, negative state | Decoration |
| Warning | `warning` orange | Near limit, attention needed | Primary navigation |
| UI chrome | background/card/muted/border | Nav, cards, tabs, sheets | Data semantics |

## Navigation principles

Updated 2026-09-07 (`FT-086`). The earlier version of this section described five items —
`Главная / История / + / Бюджеты / Ещё` — which milestone 9 superseded: budgets moved under
`Ещё` (`FT-073`), the centre `+` became `Записать` (`FT-079`), and the manual form left the bar
entirely (`FT-086`).

- Bottom nav is a bar flush with the bottom edge, full width, `border-t`, opaque, `pb-safe`.
  It is not a floating card: a floating dock leaves a gap that content scrolls through, and
  costs roughly twice the vertical space for the same targets.
- Four equal slots, in the order the day runs:
  - `Главная` — where you look
  - `История` — where you correct
  - `Записать` — the one slot that writes rather than goes
  - `Ещё` — everything that is not daily
- The action slot is the same size as a tab. It is marked by a filled disc behind its icon, not
  by extra width: navigation is chrome, and chrome does not get to be the loudest thing on the
  screen. The bold element on any screen is the amount or the capture field.
- The action uses neutral/brand tokens, never green — green carries income/success meaning.
- Tabs are `<Link>`s with `aria-current="page"`, so modified clicks work and the current page is
  announced as a page rather than as a pressed toggle.
- Every slot carries a caption. Unlabelled glyphs make the tabs a guessing game, and the icon
  set has to stay distinct from meaning used elsewhere (History is a clock, not a receipt —
  the receipt glyph already means the `Чек` capture channel).
- Extra sections like `Долги` and `Аналитика` belong in `Ещё` unless usage data proves they are
  primary daily destinations.

## CTA hierarchy

1. One global mobile primary action: the `Записать` slot, which hands focus to quick capture.
2. Screen-specific creation actions should be in-page on mobile, not floating over the bottom nav.
3. Desktop may use fixed action buttons because there is no mobile bottom nav conflict.
4. Empty states may contain their own CTA because they explain the first action in context.

## Page layout principles

- List pages use `container mx-auto px-4 py-6` consistently.
- Form/detail pages may use `container mx-auto max-w-2xl px-4 py-6`.
- Do not combine `container` with conflicting `max-w-*` on the same element unless intentionally documented.
- Mobile tabs should usually be full-width if they represent the primary split of a page.

## Design QA checklist

Before calling UI work done:

- Check real mobile screenshots, preferably production build and Telegram-like viewport.
- Judge aesthetics explicitly: visual weight, centering, label crowding, semantic color use, CTA hierarchy.
- Verify coordinates for centering only after judging the screenshot visually.
- Test at 375px, 390px, and 412px widths.
- Confirm dev-only overlays such as TanStack Query Devtools are not mistaken for production UI.

## Current decisions

- Bottom nav action slot is neutral, not green.
- Active nav items are neutral foreground, not green.
- Green remains available for income/success/healthy budget states.
- Budget page has no mobile floating create-budget FAB; creation is in-page or in empty state.
- The nav bar is opaque, not the `bg-card/80` frosted glass this document's component snippet
  shows. Both `card` and `background` resolve to pure white here, so any alpha renders a
  transaction row as ghost text under the navigation — measured legible at 85% and at 95%.
  Opaque serves this document's own "no visual noise" intent; the snippet's frosted treatment
  is right only where there is something worth frosting behind it.

## Open design questions

Raised 2026-09-07 while working through the `frontend-design` skill; none decided.

- **Uppercase eyebrow labels.** `ПОТРАЧЕНО СЕГОДНЯ`, `ПОСЛЕДНИЕ`, `КАК ЗАПИСАТЬ` and meta lines
  joined with middle dots (`Другое · Вчера`) are both named in that skill as the commonest tells
  of generated design. They may still be the right call here — this document's direction wins
  over a general heuristic — but nobody has decided it deliberately.
- **Telegram's native bottom button.** `useTelegramMainButton` exists in
  `webapp/src/shared/hooks/useTelegram.ts` and is used nowhere. Handing `Записать` to it would
  make the action native and let the bar drop to three tabs; it would also need a browser
  fallback and would touch the capture card's own submit. Sketched as variant E on the design
  canvas (see `TASKS.md`).
