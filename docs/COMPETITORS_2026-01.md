# Конкуренты — снимок января 2026

> Перенесено из GitHub Wiki 2026-11-03, когда Wiki выключили (FT-050). Это снимок на 27 января 2026, он не
> обновлялся: матрица фич устарела (экспорт, USD, свои категории, отчёты в боте и многое другое с тех пор сделано),
> ссылки на issues ведут на январские задачи, большинство из них закрыто 2026-11-03.

## Сегмент 1: Классические приложения

| Приложение | Платформа | Цена | Сильные стороны | Слабые стороны |
|------------|-----------|------|-----------------|----------------|
| **YNAB** | iOS/Android/Web/Watch | $14.99/мес ($109/год) | Zero-based budgeting, банк-синк, обучающие вебинары, sharing (до 5 чел.) | Дорого, steep learning curve, нет AI |
| **Toshl** | iOS/Android/Web | Free / Pro $2.99/мес / Medici $4.99/мес | 200+ валют + 30 крипто, мульти-теги, экспорт (CSV/Excel/PDF/Sheets), банк-синк 13k+ банков, публичный API | Нет AI/voice, перегружен, manual analysis |
| **Wallet (BudgetBakers)** | iOS/Android/Web | Freemium + $3.99/мес | 15k+ банков, AI категоризация, акции, sharing, MCP/REST API, receipt scanning | Сложный enterprise-ish UI |
| **Money Lover** | iOS/Android/Web | Free + ~$2 (без рекламы) | Детальные записи (notes, фото, location, reminders), визуализация | Нет банк-синка, нет импорта, отдельный бюджет на каждый wallet |
| **Monefy** | iOS/Android | Free + $2.48 Pro | Ультра-быстрый ввод (2 тапа), калькулятор, ad-free | Минимум аналитики, синк только через Dropbox (Pro), нет web |

## Сегмент 2: Telegram-нативные (прямые конкуренты)

| Приложение | Тип | Сильные стороны | Слабые стороны |
|------------|-----|-----------------|----------------|
| **Cointry** | TG бот + Mini App | AI категоризация, мульти-валюта, групповой бюджет, one-command ввод, месячные отчёты | Нет полноценного web UI, нет бюджетов, нет долгов, минимум аналитики |
| **TeleExpense** | TG бот | Экспорт в Google Sheets, recurring expenses | Нет AI, нет аналитики, нет web UI |

## Feature Matrix

| Фича | Finance Tracker | YNAB | Toshl | Wallet | Cointry |
|------|:-:|:-:|:-:|:-:|:-:|
| Ручной ввод | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Voice input (AI)** | ✅ | ❌ | ❌ | ❌ | ❌ |
| **AI парсинг текста** | ✅ | ❌ | ❌ | ❌ | ✅ |
| AI категоризация | ✅ | ❌ | ❌ | ✅ | ✅ |
| **ML обучение** | ✅ | ❌ | ❌ | ❌ | ❌ |
| Бюджеты | ✅ | ✅ | ✅ | ✅ | ❌ |
| Долги | ✅ | ❌ | ❌ | ✅ | ❌ |
| Dashboard/инсайты | ✅ | ✅ | ✅ | ✅ | ❌ |
| **Telegram Mini App** | ✅ | ❌ | ❌ | ❌ | Partial |
| **Premium (TG Stars)** | ✅ | ❌ | ❌ | ❌ | ❌ |
| Recurring транзакции | ❌ | ✅ | ✅ | ✅ | ❌ |
| Экспорт (CSV/PDF) | ❌ | ✅ | ✅ | ✅ | ❌ |
| Мульти-валюта | ❌ | ⚠️ | ✅ | ✅ | ✅ |
| Savings goals | ❌ | ✅ | ❌ | ✅ | ❌ |
| Групповой бюджет | ❌ | ✅ | ❌ | ✅ | ✅ |
| Банк-синк | ❌ | ✅ | ✅ | ✅ | ❌ |
| Receipt фото | ❌ | ❌ | ✅ | ✅ | ❌ |
| Периодические отчёты | ❌ | ✅ | ✅ | ✅ | ✅ |
| Онбординг | ❌ | ✅ | ✅ | ✅ | ❌ |
| Пользоват. категории | ❌ | ✅ | ✅ | ✅ | ❌ |
| Public API / MCP | ❌ | ❌ | ✅ | ✅ | ❌ |
| Group expense splitting | ❌ | ❌ | ❌ | ✅ (Coming) | ✅ |

## Наши конкурентные преимущества

| Преимущество | Описание | Кто ещё имеет |
|-------------|----------|---------------|
| **AI Voice → Transaction** | Whisper + GPT-4 парсинг голоса в транзакцию | Никто |
| **Telegram Mini App** | Полноценный web UI внутри Telegram | Cointry — partial (только бот) |
| **ML обучение** | Система учится на исправлениях пользователя | Никто из direct конкурентов |
| **Premium через TG Stars** | Нативная монетизация без внешних платёжек | Никто |
| **Clean Architecture** | Легко расширять, dual DB (SQLite/Supabase) | Enterprise apps |

## Gap Analysis — что закрыть

По приоритету (ICE Score = Impact × Confidence × Ease):

| Приоритет | Фича | ICE | Есть у | Issue |
|-----------|-------|-----|--------|-------|
| 🔴 | Recurring transactions | 810 | YNAB, Toshl, Wallet | [#71](https://github.com/chollak/finance-tracker-backend/issues/71) |
| 🔴 | Export CSV/PDF | 720 | Toshl, YNAB, Wallet | [#72](https://github.com/chollak/finance-tracker-backend/issues/72) |
| 🟡 | Weekly reports в TG | 648 | Cointry, YNAB, Wallet | [#73](https://github.com/chollak/finance-tracker-backend/issues/73) |
| 🟡 | Онбординг с demo data | 576 | YNAB, Toshl, Wallet | [#77](https://github.com/chollak/finance-tracker-backend/issues/77) |
| 🟡 | Multi-currency | 504 | Toshl, Cointry, Wallet | [#75](https://github.com/chollak/finance-tracker-backend/issues/75) |
| 🟢 | Savings goals | 420 | YNAB, Wallet | [#76](https://github.com/chollak/finance-tracker-backend/issues/76) |
| 🟢 | Quick-add widget | 392 | Monefy | [#74](https://github.com/chollak/finance-tracker-backend/issues/74) |
| ⚪ | Public API & Integrations (MCP) | 168 | Wallet | [#83](https://github.com/chollak/finance-tracker-backend/issues/83) |
| ⚪ | ShareCost — group expense splitting | 168 | Wallet (ShareCost), Splitwise, Cointry | [#84](https://github.com/chollak/finance-tracker-backend/issues/84) |
| ⚪ | Receipt scanning (AI) | — | Toshl, Wallet | Не создан |
| ⚪ | Банк-синк | — | YNAB, Toshl, Wallet | Не планируется (нерелевантно для СНГ) |

## Стратегическое позиционирование

**Ниша:** AI-powered Telegram Finance Tracker для СНГ рынка

**Что НЕ копировать:**
- Банк-синк — слишком сложно, нерелевантно для СНГ
- Stock tracking — не core value

**Roadmap приоритеты:**
1. **Wave 1 — Table Stakes:** Recurring (#71) → Export (#72) → Onboarding (#77)
2. **Wave 2 — Retention:** TG insights (#73) → Quick-add (#74) → Analytics v2 (#81)
3. **Wave 3 — Differentiation:** Multi-currency (#75) → Savings (#76) → Receipt scanning
4. **Wave 4 — Platform:** Public API & MCP (#83) → ShareCost group splitting (#84)

## Источники

- [NerdWallet — Best Budget Apps 2026](https://www.nerdwallet.com/finance/learn/best-budget-apps)
- [BudgetBakers — Wallet Features](https://budgetbakers.com/en/products/wallet/features/)
- [Cointry — Telegram Expense Bot](https://cointry.io/)
- [FindMini — Finance Telegram Apps](https://www.findmini.app/category/finance/)
- [Bountisphere — Personal Finance Apps 2025 Review](https://bountisphere.com/blog/personal-finance-apps-2025-review)

_Обновлять после каждого competitive research._
