# Design System Summary

Status: current summary for the Telegram Mini App frontend.

The project previously had an experimental `webapp/src/design-system/` folder. That package was removed. The current design system is implemented through shared shadcn/Radix-style primitives in `webapp/src/shared/ui/` plus CSS tokens in `webapp/src/app/styles/globals.css`.

## Current architecture

```text
webapp/src/shared/ui/
├── button.tsx
├── badge.tsx
├── card.tsx
├── page-header.tsx
├── form-page-header.tsx
├── typography.tsx      # PageShell, SectionStack, AmountText, MetricStat
├── dock.tsx            # mobile bottom dock primitives
└── ...                 # dialogs, sheets, forms, tabs, inputs
```

## Core decisions

- Font: **Onest**, loaded globally with weights 400–800.
- Layout: mobile-first Telegram Mini App.
- Standard card radius: `rounded-2xl` / 24px.
- Larger radius: `rounded-3xl` only for deliberate feature cards/modals.
- Core tab pages use `Layout` + `PageShell`.
- Standalone form/detail pages use `PageShell as="main"` + `FormPageHeader`.
- Mobile navigation uses a centered dock with one global `+` transaction action.

## Color rules

Use design tokens, not raw palette classes.

Semantic tokens:

| Token | Meaning |
|---|---|
| `income` | income / positive money movement |
| `expense` | expenses / negative money movement |
| `warning` | limits, trial/premium notices, near-limit states |
| `success` | successful/healthy states |
| `destructive` | dangerous destructive actions, overdue danger |

Generic CTAs use `primary`/`secondary`/`muted`, not money colors.

## Key shared primitives

| Primitive | Purpose |
|---|---|
| `PageShell` | consistent page width/padding; `as="main"` for standalone routes |
| `SectionStack` | consistent vertical rhythm |
| `PageHeader` | core tab page titles |
| `FormPageHeader` | add/edit/detail page back button + title |
| `AmountText` | tabular money display with small `UZS` suffix |
| `MetricStat` | small finance stat cards |
| `Card` | standard content container |
| `Dock` | mobile bottom navigation |

## Verification

For every UI slice:

```bash
npm run build:webapp
npm run verify
```

For visual QA:

```bash
BASE_URL=http://127.0.0.1:3000 VIEWPORT_WIDTH=390 VIEWPORT_HEIGHT=844 OUT_DIR=/tmp/ui-audit ROUTES=/,/transactions,/budgets,/more npm run design:audit
```

Check screenshots visually; build/console checks are not enough for design QA.
