# Claude Design Improvement Prompt — Finance Tracker

Copy this prompt into Claude Design chat/input. Prefer chat/input over comments because this is a system-wide prototype improvement, not a tiny local comment.

```markdown
Update the current Finance Tracker prototype. Do not rebuild it from scratch. Keep the existing visual direction, warm neutral style, Telegram Mini App frame, mobile-first layout, and overall structure. Improve the product clarity and UX based on the following recommendations.

## Core product idea to strengthen

The product is not a generic expense tracker. It is a Telegram-first finance assistant that makes weekly finance numbers trustworthy by separating real spending from money movements.

The main UX message should become even more obvious:

> Not every outgoing money movement is a real expense.

Make this visible across Home, History, Weekly Review, Quick Add, Budgets, and Debts.

---

## 1. Improve Home screen

The Home screen should explain why the numbers are trustworthy.

Add or improve a compact “trust formula” near the top:

```text
Исходящие операции: 7 240 000
− Не расходы: 3 900 000
= Реальные расходы: 3 340 000
```

Use this formula to visually teach that the app filters out own transfers, savings, debts, cash withdrawals, and group payments.

Keep the existing “Реальные расходы за месяц” card, but make the relationship between total outgoing, excluded movements, and real expenses clearer.

The “Не считаем расходом” card should stay prominent and explain:

```text
Переводы себе, вклад, долги, возвраты и наличные не искажают статистику расходов.
```

Add a small “why” / info microcopy pattern:

```text
Почему?
Деньги могли просто переехать между вашими счетами.
```

---

## 2. Improve transaction cards

Transaction cards should make semantic meaning obvious.

Each transaction should show:

- semantic badge;
- whether it counts in real expenses;
- optional explanation on tap/expand.

Examples:

```text
TBC → Alif · 500 000
Перевод себе
Не входит в расходы
Почему: деньги остались у вас, просто на другой карте.
```

```text
Вклад · Копилка · 1 000 000
Вклад / накопление
Не входит в расходы
Почему: это движение капитала, не трата.
```

```text
Возврат от Азиза · 250 000
Возврат
Уточняет прошлый расход
Почему: это не доход, а возврат ранее потраченных денег.
```

Make reimbursement visually different from normal income. It can be green-ish, but should not look exactly like salary/income.

---

## 3. Strengthen “Needs Review”

Make “Нужно проверить” feel like a trust feature, not an error.

Use copy like:

```text
Нужно проверить · 3 операции
Пока не учтены в итогах, чтобы не исказить расходы.
```

For uncertain transactions, show clear correction chips:

```text
Это не расход?
[Расход] [Перевод себе] [Вклад] [Долг] [Возврат] [Наличные]
```

After correction, show toast:

```text
Тип обновлён
Будем помнить похожие операции в будущем.
```

The design should communicate: if the app is unsure, it does not lie in analytics.

---

## 4. Improve Weekly Review

Weekly Review is the hero product loop. Make it feel like the main reason to use the product.

Add a top trust summary:

```text
Итоги честные
3 операции исключены · 2 требуют проверки
```

The structure should clearly show:

1. Real expenses;
2. Income;
3. Excluded movements;
4. Refunds/reimbursements;
5. Top categories;
6. What changed vs last week;
7. Needs review;
8. Action checklist.

Improve this block:

```text
Не считаем расходами
Переводы себе
Вклад / копилка
Долги
Наличные
Групповые платежи
```

For each excluded type, include a short reason:

```text
Переводы себе — деньги остались у вас
Вклад — капитал, не расход
Долги — ведём отдельно по человеку
Наличные — расход появится, когда потратите кэш
Групповые платежи — считаем только вашу долю
```

---

## 5. Improve Quick Add

Quick Add should feel like Telegram-native capture.

Add copy:

```text
Напишите как в Telegram
кофе 25000
TBC → Alif 500000
Азиз вернул 200000
оплатил за всех кафе 420000
```

After parsing, show a clear preview before saving:

```text
TBC → Alif
500 000 сум
Перевод себе
Не входит в расходы
```

Include correction chips below the preview.

For voice mode, show that the assistant transcribes and classifies:

```text
🎙️ “перевёл с TBC на Alif 500 тысяч”
→ Перевод себе · Не входит в расходы
```

---

## 6. Improve Splitwise-lite / Debts

Keep the UI name as:

```text
Долги
```

Do not call it Splitwise in the user-facing UI. “Splitwise-lite” is only the internal product concept.

The Debts screen should stay person-first and simple, but improve the explanation.

Add a small educational card:

```text
Долги отдельно от расходов
Когда вы платите за друга или вам возвращают деньги, это не должно ломать статистику расходов.
```

Debt cards should include source context:

```text
Азиз должен мне 140 000
Источник: Кафе Sette · оплатил за всех
[Напомнить] [Закрыть]
```

For group payments, show the intended flow:

```text
Кафе Sette · 420 000
Групповой платёж
В расходах только ваша доля: 140 000
Азиз должен: 140 000
Дилшод должен: 140 000
```

Add this either in History, Weekly Review, or Debts as a visible example.

Important: group payment should not count the full amount as real spending. Only the user's share should count.

---

## 7. Add better semantic color rules

Keep the current calm style, but clarify semantic colors:

- Expense: restrained red or dark text;
- Income: green;
- Own transfer: blue;
- Saving deposit: teal/blue;
- Debt: amber;
- Reimbursement: green/teal but distinct from income;
- Cash withdrawal: blue-gray;
- Group payment: amber;
- Needs review: amber.

Do not overuse bright colors. Semantic color should help scanning, not make the app noisy.

---

## 8. Bottom navigation

Keep the symmetric bottom navigation:

```text
Сегодня | История | + | Бюджеты | Ещё
```

Make sure the center `+` is visually centered in the phone viewport, not just centered in a flex item.

The plus button should be the primary daily action: record a transaction.

---

## 9. Do not change these

Do not turn the prototype into:

- a bank app;
- an accounting ledger;
- a desktop dashboard;
- an investment app;
- a generic SaaS landing page.

Keep it mobile, simple, Telegram-native, and trust-focused.

---

## Expected result

Update the current prototype so that a viewer immediately understands:

1. This app records money quickly from Telegram.
2. It separates real expenses from money movements.
3. Weekly Review is trustworthy because uncertain/non-expense transactions are handled explicitly.
4. Debts and group payments are tracked separately, not mixed into normal expenses.
5. The product is simple enough for daily personal use.
```
