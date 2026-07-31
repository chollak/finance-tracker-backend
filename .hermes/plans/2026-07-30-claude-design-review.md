# Claude Design Review — Finance Tracker Prototype

Source artifact: `/home/shukur/.hermes/cache/documents/doc_1235f0836217_Telegram Finance Tracker Prototype.zip`
Extracted locally to: `/tmp/claude-design-finance/`
Reviewed file: `/tmp/claude-design-finance/Finance Tracker.dc.html`

## Verdict

The Claude Design result is a strong visual and UX direction for the Finance Tracker Mini App. It is not production-ready code for direct replacement, but it is useful as a design reference and implementation target.

Overall assessment:

| Area | Score |
|---|---:|
| Visual quality | 8.5/10 |
| Telegram Mini App fit | 8/10 |
| Alignment with semantic finance thesis | 8/10 |
| Product completeness as prototype | 8/10 |
| Direct implementation readiness | 5/10 |
| Value as implementation reference | 9/10 |

## What matches the project well

1. The design clearly communicates the core product idea: not every outgoing money movement is a real expense.
2. Home screen includes:
   - real monthly expenses;
   - income;
   - excluded/non-expense movements;
   - explicit “Не считаем расходом” card;
   - review queue;
   - weekly review CTA;
   - budgets;
   - recent transactions.
3. History screen includes semantic filters:
   - Все;
   - Расходы;
   - Доходы;
   - Не расходы;
   - Нужно проверить.
4. Transaction rows include semantic badges and count labels.
5. Budgets explain that only real expenses count.
6. Weekly Review is strong and includes:
   - real expenses;
   - excluded movements breakdown;
   - refunds as correction, not income;
   - categories;
   - weekly changes;
   - review queue;
   - action checklist.
7. Quick Add flow includes text, voice, templates, parsing preview, correction chips, and toast feedback.
8. Debt screen is person-first and simple.
9. Bottom navigation is symmetric: Home / History / + / Budgets / More.

## Important concerns

1. The prototype is a standalone Claude Design artifact with inline HTML/CSS and custom `x-dc` / `sc-if` / `sc-for` tags. It should not be pasted directly into the existing React app.
2. Amount visibility and exact data are mock/demo only.
3. The prototype includes a custom lightweight parser in frontend JavaScript; production should keep parsing semantics in backend/OpenAI flow.
4. Some semantic choices are intentionally conservative, but need product decision later:
   - reimbursement reduces previous expense in the prototype;
   - group payment expects split logic;
   - debt is excluded from spending and tracked separately.
5. The visual density is polished but could be heavy if transplanted without adapting to existing components.

## Recommended implementation approach

Do not replace the Mini App wholesale. Implement in small slices:

### Phase 1 — Home semantic summary

Bring over:
- “Реальные расходы за месяц” card;
- “Не считаем расходом” card;
- review queue teaser;
- weekly review CTA.

### Phase 2 — History polish

Bring over:
- semantic badges style;
- non-expense labels;
- review transaction correction card;
- filter labels and summary copy.

### Phase 3 — Weekly Review screen

Implement a real screen based on the prototype:
- real expenses;
- income;
- excluded movement breakdown;
- top categories;
- changes vs previous week;
- needs-review queue;
- checklist.

### Phase 4 — Quick Add preview/correction

Add post-parse preview:
- semantic type label;
- whether it counts in expenses;
- correction chips;
- “Будем помнить похожие операции в будущем.”

### Phase 5 — Budgets and Debts polish

Align budgets and debts screens visually with this prototype.

## What to copy conceptually

- Warm neutral background.
- White rounded cards with subtle borders.
- Blue/teal for non-expense movements.
- Dark weekly review CTA/card.
- Semantic labels and microcopy.
- Symmetric bottom navigation around a centered plus button.

## What not to copy directly

- Inline styles.
- Prototype parser logic.
- Standalone state model.
- Claude Design custom tags.
- Full markup replacement.

## Recommended next step

Use this artifact as a design target and create implementation slices for the current React codebase. First slice should be Home semantic summary, because backend semantic calculations and transaction badges already exist.
