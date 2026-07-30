# Claude Design Prompt — Finance Tracker from Scratch

```markdown
You are Claude Design. Design a high-fidelity clickable product prototype from scratch for a Telegram-first personal finance assistant called **Finance Tracker**.

## Product thesis

This is not a generic expense tracker and not a banking app.

It is a **Telegram-first finance assistant** that turns messy daily messages, voice notes, and quick Mini App entries into a trustworthy weekly understanding of personal money.

The key product promise:

> “I can quickly record money movements in Telegram, and by the end of the week the app honestly tells me where money went — without confusing real spending with my own transfers, savings, debts, reimbursements, or cash withdrawals.”

## Main differentiation

Most finance apps show beautiful charts, but if transaction classification is wrong, the charts lie.

This product prioritizes **correct semantic classification** before fancy analytics.

A transaction has both:

```ts
type: 'income' | 'expense'
```

and:

```ts
semanticType:
  | 'expense'
  | 'income'
  | 'own_transfer'
  | 'saving_deposit'
  | 'debt'
  | 'reimbursement'
  | 'cash_withdrawal'
  | 'group_payment'
```

The UI must make this clear in human language:

- “Расход” — counts as real spending;
- “Перевод себе” — not counted as spending;
- “Вклад / накопление” — capital movement, not spending;
- “Долг” — separate from normal expenses;
- “Возврат” — offsets/clarifies previous spending;
- “Наличные” — cash movement, not final spending;
- “Групповой платёж” — needs split/review.

## Target user

Primary user:

- Russian-speaking user in Uzbekistan;
- uses Telegram daily;
- has several cards/accounts, e.g. Alif, TBC, Uzcard/Humo/Visa;
- records transactions manually or by voice/text;
- wants a weekly finance review that can be trusted;
- does not want a heavy accounting app.

Context examples:

- salary card is usually income source;
- TBC card can be main spending card;
- “Копилка”/deposit is savings/capital, not expense;
- transfers between own cards should not inflate spending;
- debts and reimbursements must be separated.

## Surface archetype

Primary surface: **Monitor + Operate**.

This is a mobile product console inside Telegram Mini App. It should not look like a marketing landing page.

Avoid:

- hero sections;
- generic SaaS feature-card grids;
- random fake stats;
- glossy AI gradients;
- overly complex desktop dashboards;
- bank/superapp overload.

The design should feel:

- calm;
- precise;
- trustworthy;
- mobile-native;
- Telegram-friendly;
- local to Uzbekistan without becoming Payme/Click.

## Required artifact

Create a single self-contained interactive HTML prototype with embedded CSS and JavaScript.

The prototype should simulate a Telegram Mini App experience on mobile-first layout, but also look acceptable on desktop.

Use Russian UI copy.

## Required screens / prototype sections

Build a clickable prototype with at least these screens or screen states:

### 1. Home / Сегодня

Purpose: quick answer to “how am I doing this month?”

Must include:

- month cashflow card;
- “Реальные расходы” amount;
- income amount;
- excluded money movements amount;
- budget status preview;
- “Needs attention” cards;
- recent transactions;
- centered bottom `+` action.

Important: show that some large operations are excluded from expenses.

Example card:

```text
Не считаем расходом
2 500 000 сум
Переводы себе, вклад, долг
```

### 2. Quick Add / Telegram capture

Purpose: show that input is fast.

Must include 3 input modes:

- text: “кофе 25000”;
- voice-like chip: “🎙️ голосом”;
- template/recent action: “такси домой”, “обед”, “TBC → Alif”.

Show parsing result before save:

```text
Кофе · 25 000 сум
Тип: Расход
Входит в месячные расходы
```

Also show semantic example:

```text
TBC → Alif · 500 000 сум
Тип: Перевод себе
Не входит в расходы
```

### 3. Transactions / История

Purpose: transparent transaction list.

Must include filters/tabs:

- Все;
- Расходы;
- Доходы;
- Не расходы;
- Нужно проверить.

Each transaction card should show:

- amount;
- merchant/description;
- category;
- semantic badge;
- whether it counts in spending.

Example transactions:

```text
-25 000 · Кофе · Расход
-500 000 · TBC → Alif · Перевод себе · Не входит в расходы
-1 000 000 · Вклад · Вклад / накопление · Не входит в расходы
-200 000 · Азиз · Долг · Отдельно
+250 000 · Возврат от Азиза · Возврат
```

### 4. Budgets / Бюджеты

Purpose: budgets are actionable, not decorative.

Show recurring monthly budgets with reset:

- Такси;
- Еда;
- Коммуналка;
- Сервисы.

Each budget should show:

- limit;
- spent;
- remaining;
- reset period;
- warning threshold.

Important: budgets must count only real expenses, not own transfers/savings/debts.

Example:

```text
Такси
620 000 / 700 000 сум
Осталось 80 000
Предупреждение на 85%
```

### 5. Debts / Долги

Purpose: person-first debt tracking inspired by Splitwise, but simpler.

Show:

- “Я должен”;
- “Мне должны”;
- net balance;
- person cards;
- due/reminder;
- settle/close action.

Example:

```text
Азиз должен мне 200 000
Последнее: оплатил за всех кафе
Напомнить: завтра
```

### 6. Weekly Review / Недельный обзор

This is the hero product loop. Make this screen especially strong.

Purpose: explain the week honestly.

Must include:

- real expenses total;
- income total;
- excluded movements breakdown;
- top categories;
- what changed vs last week;
- needs-review queue;
- action checklist.

Example:

```text
Неделя: 22–28 июля

Реальные расходы: 1 850 000 сум
Доходы: 0 сум

Не считаем расходами:
- Переводы себе: 2 000 000
- Вклад / копилка: 1 500 000
- Долги: 400 000
- Возвраты: 250 000

Нужно проверить: 3 операции
```

Make it feel like the user can trust the numbers.

### 7. Semantic correction state

Include a small interaction where user can correct classification:

```text
Это не расход?
[Расход] [Перевод себе] [Вклад] [Долг] [Возврат]
```

When selected, show microcopy:

```text
Будем помнить похожие операции в будущем.
```

## Navigation

Use a mobile bottom navigation with 4 main destinations and centered primary action:

- Home;
- History;
- + Add;
- Budgets;
- More.

Inside More:

- Debts;
- Analytics / Weekly Review;
- Recurring payments;
- Settings.

The center `+` button must be visually centered in the viewport, not just inside an uneven flex slot.

## Visual direction

Use a serious but friendly mobile fintech style.

Recommended style:

- light theme;
- warm neutral background;
- high readability;
- semantic colors for money/status only;
- green for income/safe;
- red/orange restrained for expense/warnings;
- blue/teal for own transfers/excluded movements;
- avoid noisy gradients;
- avoid dense desktop tables;
- use large touch targets, sticky actions, and clear hierarchy.

The product should feel more like:

- Telegram-native assistant;
- modern personal finance tool;
- calm financial cockpit;

and less like:

- accounting software;
- bank superapp;
- investment dashboard;
- generic SaaS landing page.

## Content rules

Do not use Lorem Ipsum.

Use realistic Russian/local examples:

- кофе 25 000;
- такси 42 000;
- TBC → Alif 500 000;
- положил на вклад 1 000 000;
- Азиз должен 200 000;
- коммуналка 300 000;
- сервисы 120 000;
- зарплата 12 000 000.

Currency: `сум`.

Use local account/card labels carefully:

- Alif;
- TBC;
- Uzcard;
- Humo;
- Visa;
- Копилка;
- вклад.

## Interaction requirements

The prototype must be clickable.

At minimum:

1. Bottom nav switches screens.
2. `+` opens Quick Add.
3. Quick Add can simulate parsing two examples:
   - normal expense;
   - own transfer.
4. User can open Weekly Review.
5. User can mark one “needs review” transaction as “Перевод себе” and see totals update or badge change.
6. Toast/haptic-style feedback after save/correction.

## Key UX message to communicate

The design must teach this idea visually:

> “Not every outgoing money movement is a real expense.”

A user should immediately understand why this app is more trustworthy than a simple expense tracker.

## Non-goals

Do not design:

- banking payments;
- card issuing;
- investment portfolio;
- crypto;
- desktop admin panel;
- enterprise dashboard;
- full accounting ledger;
- paid subscription/pricing page;
- complex import/bank sync flow.

## Quality bar

The result should look like a polished early-stage product prototype that could be shown to a founder, client, or potential user.

It should answer:

1. What is the product?
2. Why is it better than a simple expense tracker?
3. How does Telegram-first capture work?
4. How does semantic classification prevent wrong analytics?
5. What will the weekly review feel like?
```
