# UI Design-System Audit — Finance Tracker Mini App

Date: 2026-07-29
Scope: `webapp/src/shared/ui`, `pages`, `widgets`, `entities`, `features` (post design-system-cleanup commits, `dec5430`..`585031a`)
Method: static code read + grep across the webapp source tree. No servers started, no screenshots taken, no files edited.

## Summary

The cleanup successfully introduced a real shared vocabulary (`PageShell`, `SectionStack`, `AmountText`, `MetricStat`, `PageHeader`, `FormPageHeader`, semantic color tokens, `Dock`/`BottomNav`) and it's fully adopted on **Home, Budgets, Transactions, More**. The drift is concentrated in everything the cleanup pass didn't reach yet: **Debts, Analytics, Add/Edit-Transaction, Add/Edit-Budget, Add-Debt, Debt-Details**, plus a handful of hardcoded non-semantic colors and one systemic radius mismatch. Nothing found requires backend/API changes — all findings are markup/className-level.

## Findings

### P0 — Structural bug, visible on every core tab

**1. Nested `<main>` landmarks + doubled bottom padding on Home/Budgets/Transactions/More**

- `shared/ui/layout.tsx` (`Layout`) renders `<main className="pb-[calc(5rem+env(safe-area-inset-bottom))] md:pb-0">{children}</main>` around the router `<Outlet/>`.
- `shared/ui/typography.tsx` (`PageShell`) — used by `HomePage`, `BudgetsPage`, `TransactionsPage`, `MorePage` — renders its own `<main className="mx-auto w-full max-w-3xl px-4 py-5 pb-28 md:py-6">`.
- Result: two `<main>` elements nested inside each other (invalid landmark structure, hurts screen-reader navigation), and on mobile their bottom paddings **stack**: `5rem (80px) + safe-area` from `Layout` plus `pb-28 (112px)` from `PageShell` ≈ **192px + safe-area** of dead space above the dock.
- `DebtsPage`/`AnalyticsPage` don't use `PageShell` (see #3) and only inherit `Layout`'s ~80px, which is already enough to clear the dock — so these two tabs sit noticeably tighter than the other four. Same nav, visibly different whitespace rhythm depending on which tab you're on.
- Fix is layout-only: pick one owner for dock-clearing padding (recommend keeping it in `Layout`, dropping `pb-28`/rendering `PageShell` as a `<div>`), no business logic touched.

### P1 — Real inconsistency, user-facing

**2. `FormPageHeader` migration is half-done**

- `AddTransactionPage`, `AddBudgetPage`, `AddDebtPage` correctly use the shared `FormPageHeader` (back button + `h1` + optional subtitle, one visual spec).
- `EditTransactionPage`, `EditBudgetPage`, `DebtDetailsPage` still hand-roll the identical thing: manual `<ArrowLeft className="h-5 w-5" />` + `<h1 className="text-3xl font-bold">...</h1>` + ad-hoc `<p className="text-muted-foreground mt-1">`.
- Net effect: opening "Add" vs "Edit" for the same entity shows two subtly different header treatments (spacing, icon button hit-area, focus/hover states differ since the hand-rolled version isn't a real `<Button variant="ghost" size="icon">`).
- Mechanical fix: swap the hand-rolled block for `<FormPageHeader title=... subtitle=... onBack=...>` in these three files.

**3. Four coexisting "page root" patterns**

- Pattern A (new): `PageShell` + `SectionStack` + `PageHeader` → Home, Budgets, Transactions, More.
- Pattern B: `PageHeader` (new) but wrapped in legacy `<div className="container mx-auto px-4 py-6">` → Debts, Analytics.
- Pattern C: `FormPageHeader` (new) but wrapped in legacy `<div className="container mx-auto max-w-2xl px-4 py-6">` → AddTransaction, AddBudget, AddDebt.
- Pattern D: fully legacy, hand-rolled header + legacy container → EditTransaction, EditBudget, DebtDetails.
- Practical impact: Tailwind's `container` utility snaps to breakpoint-width steps (e.g. widens to 1024px at `lg`), while `PageShell` caps at a fixed `max-w-3xl` (768px) — so content measure/line-length silently changes width depending on which page you're on at tablet/desktop sizes, and vertical rhythm (`py-6` vs `py-5 pb-28 md:py-6`) differs too.
- Since `PageHeader`/`FormPageHeader` are already present in Patterns B/C, closing this gap is just replacing the outer wrapper `div` with `PageShell`(+`SectionStack` where a list of cards follows) — no component API changes needed.

**4. Hardcoded non-semantic colors bypass the token system**

- `entities/debt/ui/DebtCard.tsx` and `pages/debt-details/ui/DebtDetailsPage.tsx`: overdue state uses raw `border-red-200 bg-red-50/50` and `text-red-600` instead of the existing `destructive`/`expense` CSS tokens (`--color-destructive`, `--color-expense` are already defined and used elsewhere).
- `entities/subscription/ui/PremiumBadge.tsx` and `widgets/usage-limits/ui/PremiumStatusCard.tsx`: premium/subscription UI uses raw `purple-*` Tailwind classes. This directly contradicts the documented anti-pattern ("Purple/violet gradients — AI slop aesthetic") and the "semantic colors only" rule — there is no `premium`/accent token defined for this, so it was never routed through the system in the first place.
- These four files are the **only** hits for hardcoded `red-*`/`purple-*`/etc. across the whole `webapp/src` tree — the rest of the app is clean, so this is a small, contained fix.

### P2 — Systemic but lower visible impact

**5. Card radius doesn't match documented scale**

- `docs/knowledge-base/10-design-guidelines/design-guidelines.md` specifies cards at **20–24px** (`--radius-xl`/`--radius-2xl`), reserving 32px (`--radius-3xl`) for "modals/feature cards" only.
- The shared `Card` primitive (`shared/ui/card.tsx`) hardcodes `rounded-3xl` (→ `--radius-3xl` = 32px per `globals.css`), so **every** default `Card` consumer across the app renders at the "feature card" radius, not the standard-card radius the docs call for.
- Radius usage elsewhere is scattered with no single enforcement point: `rounded-md`×17, `rounded-lg`×17, `rounded-xl`×19, `rounded-2xl`×13, `rounded-3xl`×8, plus stray `rounded-sm`/`rounded-none` hits — e.g. `MetricStat` correctly uses `rounded-2xl` (24px, matches docs) while the `Card` primitive it often sits inside does not.
- This is a one-line change (`rounded-3xl` → `rounded-2xl` in `card.tsx`) but it's **global** — every screen using `Card` changes visually. Treat as its own reviewed slice with a before/after screenshot pass, not bundled with structural fixes above.

**6. CLAUDE.md's Design System section is stale**

- CLAUDE.md still documents `lime`/`lavender` `Button` variants ("Transfer"/"Request" style) from an earlier iteration. The actual `shared/ui/button.tsx` no longer has these — it only has `default/destructive/outline/secondary/ghost/link` plus the new semantic `income`/`expense` variants. Code is clean; the doc is what's out of date. Low risk today, but a future contributor reading CLAUDE.md could reintroduce a non-semantic accent color believing it's sanctioned.

## What's already correct (no action needed)

- **Font**: Onest is configured once, globally (`index.html` link + `--font-family-sans` in `globals.css`) and applied consistently — no per-component font drift found.
- **`Button` primitive**: clean semantic variant set, no legacy accent colors, single 12px (`rounded-xl`) radius for buttons/inputs as documented.
- **Dock / BottomNav**: centered primary `+` action, safe-area aware, single accent color, matches the "centered +" requirement exactly. No conflicts with page content found.
- **Desktop FAB pattern**: Home/Transactions/Budgets/Debts all use the identical `hidden md:fixed md:bottom-6 md:right-6 ...` convention to avoid a competing mobile FAB — this is consistently applied across all four.
- **Semantic color tokens** (`income`/`expense`/`warning`/`success`/`destructive`) are properly defined in `globals.css` and used correctly almost everywhere except the four files in finding #4.

## Not fully audited (flag for follow-up, not claimed clean)

Given the pass focused on structural/page-shell drift, these were not read in depth and should get a dedicated look before being called clean: `features/quick-add`, `widgets/spending-chart`, `widgets/financial-health`, full `entities/transaction` UI, form validation/error states, and `empty-state.tsx` usage consistency across pages.

## Recommended next implementation slice (safest, highest signal-to-risk)

Bundle **#1 (padding/nesting bug) + #3 (page-shell adoption) + #2 (FormPageHeader adoption)** into one slice:

1. Resolve the double bottom-padding: remove `pb-28`/`<main>` semantics from `PageShell` (render a `<div>`, keep the padding decision solely in `Layout`), or vice versa — pick one owner.
2. Swap the legacy `container mx-auto ... px-4 py-6` wrapper for `PageShell` (+`SectionStack` where applicable) in `DebtsPage`, `AnalyticsPage`, `AddTransactionPage`, `AddBudgetPage`, `AddDebtPage`.
3. Replace the hand-rolled back-button+title block in `EditTransactionPage`, `EditBudgetPage`, `DebtDetailsPage` with `FormPageHeader`.

This is purely wrapper/className/JSX-structure work, touches zero business logic, API calls, or data shapes, and directly fixes the one defect a user would actually notice (excess empty space above the dock on 4 of 6 tabs) while collapsing four page-root patterns down to two (list pages vs form pages) as the design system already intends.

Treat **#4 (hardcoded red/purple)** as a small separate slice (four files, clear token substitutions, but the purple premium badge needs a product decision on what semantic/token it should map to — don't invent a new color unilaterally).

Treat **#5 (Card radius)** as its own slice requiring visual review, since it's a one-line change with app-wide visual impact.
