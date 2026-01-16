# UX Improvements Documentation

This section tracks UI/UX improvements for the Finance Tracker webapp.

## Contents

- [UI/UX Analysis](./ui-ux-analysis.md) - Complete analysis and recommendations

## Status

- **Focus:** UX Efficiency
- **Phase:** Priority 1-4 Completed ✅

---

## ✅ Completed (Jan 2025)

### Priority 1: Quick Add Experience
- [x] Quick Add Mode (Sheet + amount-first)
- [x] Recent Categories Bar
- [x] Type Toggle Inline (Доход/Расход кнопки)

### Priority 2: Dashboard UX
- [x] Inline Quick Actions [+Доход] [-Расход] под балансом
- [x] Budget Velocity Predictions ("Бюджет превышен", "Хватит до X")

### Priority 3: Form Efficiency
- [x] Auto-focus на Amount
- [x] Merchant Auto-suggest (из истории транзакций)
- [x] Date Shortcuts (Сегодня/Вчера)

### Priority 4: Visual Polish
- [x] Dark Mode (system preference + toggle)
- [x] Enhanced Empty States (с иконками и tips)
- [x] Micro-animations (fade-in-up, card-hover, button press)

---

## 📋 Backlog

### Amount Presets + Mini Calculator (Комбо)

**Описание:** Пресеты сумм с возможностью сложения/вычитания

```
┌────────────────────────────────┐
│  Сумма: [85000_____________]   │
│                                │
│  [+5K] [+10K] [+25K] [+50K]    │  ← Добавляют к текущему
│  [-5K] [-10K]                  │  ← Убавляют
│                                │
│  💡 Можно писать: 50000+25000  │
└────────────────────────────────┘
```

**Функции:**
- Кнопки пресетов добавляют/убавляют от текущего значения
- Поддержка математики в поле ввода (`50000+25000+10000` → `85000`)
- Пресеты настроены под UZS: 5K, 10K, 25K, 50K, 100K

**Flow:**
1. Ввести `50000`
2. Тап `[+25K]` → `75000`
3. Тап `[+10K]` → `85000`
4. Или сразу: `50000+25000+10000`

**Файлы:** `webapp/src/features/quick-add/ui/QuickAddForm.tsx`

---

### AI Insights Card

**Описание:** Персонализированные советы на дашборде

```
┌────────────────────────────────┐
│ 💡 Инсайт                       │
│                                │
│ "Расходы на еду выросли на 25% │
│ по сравнению с прошлым месяцем"│
│                                │
│ [Подробнее →]                  │
└────────────────────────────────┘
```

**Возможные инсайты:**
- Сравнение с прошлым месяцем
- Аномалии в категориях
- Советы по бюджетам

---

### Отложено (не приоритет)

- Swipe-to-Archive — жест для архивации
- Pull-to-Refresh — стандартный мобильный паттерн
- Advanced Analytics — графики трендов (нужны данные)
- Onboarding — welcome screens для новых пользователей
