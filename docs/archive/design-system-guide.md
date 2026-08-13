# Design System Guide

Status: current for the Telegram Mini App frontend.

The old `webapp/src/design-system/` package and its decorative accent variants were removed. New UI work must use the shadcn/Radix-style primitives in `webapp/src/shared/ui/` and the CSS tokens in `webapp/src/app/styles/globals.css`.

## Source of truth

- Shared primitives: `webapp/src/shared/ui/`
- Global tokens: `webapp/src/app/styles/globals.css`
- TypeScript token mirror: `webapp/src/shared/lib/design-tokens.ts`
- Product UI rules for agents: `CLAUDE.md` → “Design System (WebApp Frontend)”

## Core principles

1. **Mobile-first finance UI** — calm, readable, trustworthy.
2. **One neutral UI layer** — structure uses `background`, `card`, `primary`, `secondary`, `muted`, `border`.
3. **Semantic money colors only**:
   - `income` = income/successful money movement
   - `expense` = expense/loss
   - `warning` = limits, trial/premium status, near-limit states
   - `destructive` = destructive actions and overdue danger states
4. **No raw Tailwind palette classes in product UI** — avoid classes such as direct palette color names. Use semantic tokens instead.
5. **Standard card radius** — default `Card` is `rounded-2xl` (24px). Use `rounded-3xl` only for deliberate feature cards/modals.
6. **Bottom navigation** — mobile dock has a centered `+` action. Do not add competing mobile FABs.

## Shared primitives

Import from `@/shared/ui` or the specific file:

```tsx
import { Button, Card, PageHeader, PageShell, SectionStack } from '@/shared/ui';
```

Common primitives:

- `Button`
- `Badge`
- `Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`, `CardFooter`
- `PageShell`
- `SectionStack`
- `PageHeader`
- `FormPageHeader`
- `AmountText`
- `MetricStat`
- `Dock`, `DockItem`, `DockSeparator`
- `EmptyState`
- form controls, dialogs, sheets, tabs, segmented controls

## Page layout rules

### Core tabs inside `Layout`

Use `PageShell` as a `div` because `Layout` already owns the `<main>` landmark and bottom-nav clearance.

```tsx
<PageShell>
  <PageHeader title="Главная" subtitle="Обзор ваших финансов" />
  <SectionStack>{/* cards */}</SectionStack>
</PageShell>
```

### Standalone form/detail routes

Use `PageShell as="main"` because these routes are outside the nav `Layout`.

```tsx
<PageShell as="main" className="max-w-2xl">
  <FormPageHeader title="Новая транзакция" onBack={() => navigate(-1)} />
  {/* form */}
</PageShell>
```

## Typography

- Font: Onest via `--font-family-sans`.
- Page titles: shared `PageHeader` / `FormPageHeader`.
- Card titles: shared `CardTitle` default scale.
- Money: use `AmountText` so digits are tabular and `UZS` is visually secondary.
- Avoid arbitrary one-off text sizes unless a component genuinely needs a local exception.

## Buttons and badges

Button variants:

- `default`
- `destructive`
- `outline`
- `secondary`
- `ghost`
- `link`
- `income`
- `expense`

Badge variants:

- `default`
- `secondary`
- `destructive`
- `outline`
- `income`
- `expense`
- `warning`
- `success`

Generic CTAs should use neutral/primary styling. Do not use green for generic actions; green is reserved for income/success meaning.

## Verification checklist

For UI changes:

```bash
npm run build:webapp
npm run verify
```

For mobile visual QA, capture at least 375, 390, and 412 px with relevant routes:

```bash
BASE_URL=http://127.0.0.1:3000 VIEWPORT_WIDTH=390 VIEWPORT_HEIGHT=844 OUT_DIR=/tmp/ui-audit ROUTES=/,/transactions,/budgets,/more npm run design:audit
```

A technical pass is not enough. Inspect screenshots for visual hierarchy, spacing rhythm, color semantics, and bottom-nav/content collision.
