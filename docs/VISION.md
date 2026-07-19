# Product Vision: Finance Tracker

> **Северная звезда** — этот документ определяет конечный результат проекта.
> Сверяйся с ним при каждом изменении.

---

## Миссия

> Помочь людям легко вести личные финансы голосом, видеть куда уходят деньги, и уверенно планировать будущее.

---

## Целевая аудитория

| Этап | Аудитория | Цель |
|------|-----------|------|
| **Сейчас** | Создатель + семья | Dogfooding, поиск багов |
| **MVP** | Друзья и родственники | 10-20 активных пользователей |
| **Growth** | Публичный запуск в Telegram | 100+ MAU |
| **Scale** | Международная аудитория | Подписки покрывают расходы |

---

## Метрики успеха

| Метрика | Цель MVP | Цель Growth |
|---------|----------|-------------|
| MAU | 100 | 1000+ |
| DAU/MAU ratio | 20%+ | 30%+ |
| Retention D7 | 40%+ | 50%+ |
| Транзакций/пользователь/месяц | 20+ | 30+ |
| Revenue | Покрывает расходы | Прибыль |

---

## Бизнес-модель

### Free tier (ограничения)
- 50 транзакций/месяц
- 10 голосовых вводов/месяц
- Без аналитики и графиков
- Без сканера счетов

### Premium tier (полный доступ)
- Безлимитные транзакции
- Безлимитный голосовой ввод
- Полная аналитика и графики
- Долги (кто кому должен)
- Сканер счетов (в будущем)
- Новые фичи по мере добавления

### Монетизация
- **Платёжная система:** Telegram Payments (Stars / Bot Payments)
- **Trial период:** 14 дней бесплатного Premium

---

## Готовые фичи

| Фича | Статус |
|------|--------|
| Голосовой ввод транзакций | ✅ Ready |
| Текстовый ввод | ✅ Ready |
| Просмотр транзакций (список, фильтры) | ✅ Ready |
| Бюджеты с лимитами | ✅ Ready |
| Analytics (категории, тренды) | ✅ Ready |
| Telegram Mini App | ✅ Ready |
| Supabase Production | ✅ Ready |
| Долги (DebtModule, кто кому должен) | ✅ Ready |
| Premium подписка + лимиты (SubscriptionModule) | ✅ Ready |
| Оплата Telegram Stars | ✅ Ready |
| 14-дневный Free Trial | ✅ Ready |

---

## Текущий статус (обновлено 2026-07-19)

Все 8 модулей backend уже реализованы и покрыты кодом: `TransactionModule`, `BudgetModule`,
`DebtModule`, `VoiceProcessingModule`, `OpenAIUsageModule`, `DashboardModule`,
`SubscriptionModule`, `UserModule`. Подробности и зависимости — в
[docs/knowledge-base/01-architecture/modules.md](knowledge-base/01-architecture/modules.md).

Ранее этот документ отмечал DebtModule и SubscriptionModule (а также Payment Integration и
Free Trial) как TODO-блокеры запуска. Это устарело: аудит FT-001/FT-003 подтвердил, что весь
код для них уже существует:

| # | Что считалось блокером | Фактический статус | Где реализовано |
|---|------------------------|--------------------|------------------|
| 1 | DebtModule | ✅ Done | `src/modules/debt/` |
| 2 | SubscriptionModule (Free/Premium + лимиты) | ✅ Done | `src/modules/subscription/` |
| 3 | Payment Integration (Telegram Stars) | ✅ Done | `src/modules/subscription/infrastructure/TelegramPaymentService.ts`, `src/delivery/messaging/telegram/handlers/paymentHandlers.ts` |
| 4 | Free Trial (14 дней) | ✅ Done | `StartTrialUseCase` в `src/modules/subscription/application/grantPremium.ts` |

**Известный незакрытый пробел:** `SubscriptionService.processExpiredSubscriptions()`
(`src/modules/subscription/application/subscriptionService.ts`) реализован и рассчитан на вызов
из cron job, но нигде в коде не подключён к планировщику — автоматический downgrade подписки
после истечения trial/premium сейчас не запускается сам по себе. Это не блокер запуска "с нуля",
а небольшая доработка (см. Next Roadmap ниже).

---

## POST-MVP фичи

| Фича | Приоритет | Версия |
|------|-----------|--------|
| Мультивалютность | Medium | v1.2 |
| Сканирование чеков | Low | v2.0 |
| Split expenses | Low | v2.0 |

---

## Next Roadmap (после реконсиляции документации)

Фазы 1–4 старого "Плана выхода на прод" (DebtModule, Subscription System, Payment Integration,
Free Trial) уже выполнены и удалены из плана. Осталось:

### Фаза A: Автоматизация подписок (небольшая доработка)
- Подключить `SubscriptionService.processExpiredSubscriptions()` к scheduler (cron/interval)
- Уведомления об окончании trial/premium

### Фаза B: Pre-launch Testing
- Тест полного flow: регистрация → trial → использование → оплата → истечение
- Bug fixes

### Фаза C: Soft Launch
- Пригласить 5-10 друзей/родственников
- Собрать feedback
- Итерации по UX

### Фаза D: Public Launch
- Опубликовать бота в Telegram Directory
- Начать собирать MAU и revenue метрики

Выбор конкретного следующего вектора работы — предмет отдельной задачи (см. `TASKS.md`, FT-004).

---

## Дистрибуция

- **Telegram бот** — основной канал (search/share)
- **Сарафанное радио** — друзья рекомендуют друзьям

---

*Документ создан: 2026-01-18*
*Последнее обновление: 2026-07-19 (FT-003: реконсиляция с фактической реализацией)*
