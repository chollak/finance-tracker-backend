# Finance Tracker Style Direction

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

- Bottom nav has 4 destinations plus one centered action:
  - `Главная`
  - `История`
  - `+`
  - `Бюджеты`
  - `Ещё`
- The center `+` is a generic primary action, not a financial success state.
- `+` should use a neutral/brand treatment: surface, border, subtle shadow, foreground icon.
- Green should not be used merely because an element is important.
- Extra sections like `Долги` and `Аналитика` belong in `Ещё` unless usage data proves they are primary daily destinations.

## CTA hierarchy

1. One global mobile primary action: center `+` for adding a transaction.
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

- Bottom nav center `+` is neutral, not green.
- Active nav items are neutral foreground, not green.
- Green remains available for income/success/healthy budget states.
- Budget page has no mobile floating create-budget FAB; creation is in-page or in empty state.
