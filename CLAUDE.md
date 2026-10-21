# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Current Operating Mode — READ FIRST

> ### ⚠️ 2026-09-06 — доска задач разделена
>
> `TASKS.md` больше не содержит закрытые задачи. В нём только текущий фокус, задача в работе,
> очередь и таблица backlog — 176 строк вместо 3767.
>
> | Что | Где |
> |---|---|
> | Задача в работе, очередь, таблица backlog | `TASKS.md` |
> | Отложенные задачи с описаниями | `docs/tasks/backlog.md` |
> | 108 закрытых задач с отчётами | `docs/tasks/archive/` |
> | Лог решений по плану, новые сверху | `docs/tasks/decisions.md` |
> | Правила доски, статусы, роли, формат задачи | `docs/tasks/README.md` |
>
> **Закрывая задачу, переноси её тело целиком в нужный файл `docs/tasks/archive/` — не оставляй
> её в доске со `Status: done`.** Снимая с очереди — переноси в `docs/tasks/backlog.md`, в доске
> оставляй строку таблицы. Подробности и причина: `docs/tasks/decisions.md`, запись 2026-09-06.

**Goal now (2026-10-16):** веха 10 — перенос утверждённого дизайна «Пастель» (`docs/pastel/`) в этот проект узкими срезами FT-087…FT-136. Проект развивается, а не пишется заново; старые production/AWS-планы не возвращать.

**Source of truth for current work:** `TASKS.md` — секция «Текущий фокус» и раздел «В работе» (раскладку см. в блоке выше). GitHub Issues/Wiki may contain stale January-era planning; use them only when a task explicitly asks to reconcile them.

**Runtime target now:** local WSL + SQLite + Telegram polling + Cloudflare quick tunnel for Mini App phone testing. Production/AWS is intentionally parked; `sapaev.uz` and Supabase are not the active dev path.

**Home/Capture UX (2026-10-16):** целевой интерфейс — «Пастель»: правила, токены и компоненты в `docs/pastel/`, экраны — на холсте (ссылка в `docs/pastel/README.md`). Нижнего бара (`FT-086`) больше нет (FT-110): главная — шапка с «Ещё», карточка баланса, плитки месяца и последние операции (FT-111), внизу — поле ввода с чипами частых трат (FT-114; карточка ввода `FT-073`, `FT-074` удалена), фраза открывает проверку записей `/review`. Раздел Design System ниже описывает «Пастель»; гайды в `docs/knowledge-base/10-design-guidelines/` — архив (FT-096).

**State (2026-10-21):** фазы 0–8 вехи 10 сделаны в облаке — ветка `claude/new-session-uv5og7`, ещё не слита. `TASKS.md` пока показывает фазу 0: статусы ставит Hermes после проверки. Что сделано, что проверить на своей машине и что осталось (FT-117, FT-134, FT-135, FT-143, FT-108, FT-136) — [`docs/pastel/handoff.md`](docs/pastel/handoff.md).

**Current implementation queue (2026-10-16):** веха 10, фаза 0: `FT-087` (в работе) → спайки `FT-088` и `FT-089` → `FT-090` (миграции TypeORM) → `FT-091` (выключатель лимитов). Полные описания и порядок по `Depends` — `docs/pastel/tasks.md`; решения Д1–Д7 — `docs/tasks/decisions.md`. Веха 9 закрыта, FT-082…FT-086 отменены. Реализация только narrow slices через Claude Code; Hermes финально проверяет diff/tests/screenshots и коммитит. Безопасный план quick capture закрыт полностью: гайд «как записывать операции» через Telegram (`FT-076`, `docs/IOS_SHORTCUT_ACTION_BUTTON.md`) и прямой Shortcut-вызов `POST /api/quick-capture` **для dev/test** (`FT-075`). Dev/test-контур: `X-Shortcut-User-Id` задаёт владельца и принудительно ставит `source=ios_shortcut`, опциональный `SHORTCUT_CAPTURE_TOKEN` проверяется через `X-Shortcut-Capture-Token` (плейсхолдер есть в `.env.example`), а при `NODE_ENV=production` весь обход отвергается с 403 `SHORTCUT_CAPTURE_DISABLED`. Это **не продовая auth-модель**: продовый токен (выдача, срок жизни, отзыв, отдельный rate limit для не-Telegram источника) — будущее решение Шукура, а не текущий блокер. Не включать обход в проде и не класть реальные токены в клиентские инструкции. `FT-049`/`FT-050` (GitHub-сверка, ветки) требуют явного разрешения на внешние действия. The live semantic smoke (`FT-044`), its debt-linked transaction bug (`FT-072`), read-only historical semantic preview (`FT-045`), budgets page UX cleanup (`FT-055`), transaction row readability (`FT-056`), collapsed semantic corrections (`FT-057`), touch target compliance (`FT-058`), the minimal Home/Capture slice (`FT-073`), the capture action row/states (`FT-074`), the iPhone Action Button guide (`FT-076`), the dev/test Shortcut capture API (`FT-075`), and the guideline polish trio (`FT-059`, `FT-060`, `FT-061`) are done/verified locally. Do not apply data backfills (единственное исключение — FT-108 после просмотра списка Шукуром), close GitHub issues, delete branches, touch production/Supabase, or change product-policy without the explicit stop/ask rules below.

**Stop/ask before:** production deploys, Supabase SQL/migrations, billing/subscription policy changes, rate-limit policy changes, product IA decisions beyond what `docs/pastel/` describes, destructive branch deletion, force dependency upgrades (`npm audit fix --force`).

**Role split:** Claude Code implements narrow TDD slices; Hermes reviews diff, runs verification, updates board/report, commits and pushes.

## Development Commands

**Build and Run:**
- `npm run build` - Compile TypeScript to JavaScript in `dist/` folder
- `npm run serve` - Run the compiled application from `dist/index.js`

**Development (Choose one):**
- `npm run dev:full` - Full-stack development with hot reload
  - Backend: http://localhost:3000 (API + static files)
  - Frontend: http://localhost:5173 (React dev server with hot reload)
  - API calls automatically proxy from frontend to backend
- `npm run dev:miniapp -- --chat-id=<telegram_chat_id>` - 🚀 **RECOMMENDED for phone/Mini App testing**: starts a Cloudflare quick tunnel, updates local `WEB_APP_URL`, updates the Telegram persistent menu button, builds, and runs `npm run serve`
- `npm run miniapp:menu -- status --chat-id=<telegram_chat_id>` - safely inspect current `WEB_APP_URL` + Telegram menu button without printing the bot token
- `npm run miniapp:menu -- set --url=<https_url> --chat-id=<telegram_chat_id>` - update `.env` `WEB_APP_URL` and Telegram menu button for an existing tunnel
- `npm run dev` - Backend only (serves static production build)
- `npm run dev:frontend` - Frontend only (requires backend running separately)
- `npm run dev:backend` - Backend only (same as `npm run dev`)

**Database migrations (FT-090):**
- `npm run migration:show` - Applied/pending migrations and whether the schema matches the entities
- `npm run migration:run` - Back up `data/database.sqlite` to `data/backups/`, then apply pending migrations (the app also does this on start)
- `npm run migration:revert` - Back up, then undo the last migration

**Testing:**
- `npm test` - Run Jest tests (located in `tests/` folder)
- `npm run test:ci` - Run Jest tests serially for CI/Hermes verification
- `npm run analyze` - Run dependency-cruiser and circular dependency checks
- `npm run verify` - Full pre-commit/pre-push gate: backend build, serial Jest tests, webapp Vitest tests, webapp build, architecture checks
- Tests use ts-jest preset and target Node.js environment

**Web App (React + Vite):**
- `npm run install:webapp` - Install webapp dependencies  
- `npm run build:webapp` - Build React frontend to `public/webapp/`

**Docker:**
- `docker compose up -d --build` - Build and run in container
- `docker compose logs -f` - View container logs
- `docker compose down` - Stop and remove containers

## Environment Configuration

Required environment variables in `.env` file:
- `OPENAI_API_KEY` - For voice transcription and transaction parsing
- `TG_BOT_API_KEY` - Telegram bot token
- `WEB_APP_URL` - Public URL for the web application
- `TG_BOT_USERNAME` - optional; the bot's @username for the web login link `t.me/<bot>?start=login_…` (FT-128). When empty the server asks Telegram (`getMe`)
- `FREE_LIMITS_ENABLED` - optional; `true` enforces free-tier limits (50 records, 10 voice inputs a month). Off by default during milestone 10 (decision Д3, FT-091); usage is still counted
- `DATABASE_TYPE` - optional; only `sqlite` is supported (any other value fails startup). The `supabase-js` path was removed in FT-090 (decision Д6)

**Historical, not active:**
- **Supabase Project ID:** `cttsquvkvkwtxsfrgsrs` — project paused; the app no longer talks to Supabase. Do not modify it without explicit permission
- **Test User telegramId:** `597843119` (Konan)
- **Production Domain:** `https://sapaev.uz` (owned by Shukur but not an active deployment target as of 2026-08-13)

**Logging:**
- `LOG_LEVEL` - Log level: `error`, `warn`, `info` (default), `debug`

The application validates these on startup and will exit with descriptive errors if required variables are missing.

**Environment file policy:**
- Tracked: `.env.example` only.
- Ignored/local: `.env`, `.env.local`, `.env.development`, `.env.*.local`.
- `AppConfig` loads `.env.local` if present, otherwise `.env`; existing `process.env` values remain highest priority.
- `.env.development` is ignored for backwards compatibility but is not loaded by the app. Use `.env.local` for machine-specific local values.
- Never print real env values in logs/reports; list keys only with values redacted.

## Logging

The application uses **Winston** for structured logging with category-based filtering.

**Location:** `src/shared/infrastructure/logging/`

**Usage:**
```typescript
import { createLogger, LogCategory } from '../shared/infrastructure/logging';

const logger = createLogger(LogCategory.TRANSACTION);
logger.info('Transaction created', { id: '123', amount: 100 });
logger.error('Failed to save', error);
```

**Log Categories:** source of truth is the `LogCategory` const in `src/shared/domain/ports/Logger.ts` — read it instead of relying on a copy here. It groups categories into System, Security, Business Logic, External Services, Request Handling, and Performance.

**Output Format:**
- Development: Colorized, human-readable
- Production: JSON (for log aggregators)

## Documentation

For detailed documentation, see **[docs/knowledge-base/](docs/knowledge-base/)**:

- **[Architecture](docs/knowledge-base/01-architecture/)** - Clean Architecture, modules, design patterns
  - [Overview](docs/knowledge-base/01-architecture/overview.md) - Layers and dependency flow
  - [Modules](docs/knowledge-base/01-architecture/modules.md) - 16 модулей системы
  - [Patterns](docs/knowledge-base/01-architecture/patterns.md) - Repository, DI, Factory, Use Case
  - [Runtime / Process Mode](docs/knowledge-base/01-architecture/runtime-process-mode.md) - API/Bot/Worker process-mode decision
  - [API / Domain Consistency Audit](docs/knowledge-base/01-architecture/api-domain-consistency-audit.md) - FT-018 controller/use-case/API contract audit
  - [Auth / User Resolution Boundary Matrix](docs/knowledge-base/01-architecture/auth-user-resolution-boundary-matrix.md) - FT-024 auth/guest/ownership boundaries
  - [Transaction / Debt Relationship Audit](docs/knowledge-base/01-architecture/transaction-debt-relationship-audit.md) - FT-021 debt/transaction accounting semantics
  - [DTO / Schema Validation Consistency Audit](docs/knowledge-base/01-architecture/dto-schema-validation-audit.md) - FT-023 validation layering policy
- **[Data Flow](docs/knowledge-base/07-data-flow/)** - How data moves through the system
  - [Voice → Transaction](docs/knowledge-base/07-data-flow/voice-to-transaction.md) - AI-powered voice processing
  - [API Lifecycle](docs/knowledge-base/07-data-flow/api-lifecycle.md) - HTTP request flow
  - [Budget Calculation](docs/knowledge-base/07-data-flow/budget-calculation.md) - Cross-module calculations
- **[Development Guide](docs/knowledge-base/08-development/)** - Quick start, adding features
  - [Quick Start](docs/knowledge-base/08-development/quick-start.md) - Setup and running
  - [Adding Features](docs/knowledge-base/08-development/adding-features.md) - Use cases, endpoints, modules
  - [Database Guide](docs/knowledge-base/08-development/database-guide.md) - SQLite, TypeORM, migrations
  - [Troubleshooting](docs/knowledge-base/08-development/troubleshooting.md) - Common issues
  - [Test Logging & Contract Cleanup](docs/knowledge-base/08-development/test-logging-and-contract-cleanup.md) - FT-017 findings and cleanup plan
  - [Task Workflow](docs/knowledge-base/08-development/task-workflow.md) - TASKS.md vs GitHub Issues decision
  - [API Route Coverage Matrix](docs/knowledge-base/08-development/api-route-coverage-matrix.md) - FT-022 route coverage audit
- **[UX Improvements](docs/knowledge-base/09-ux-improvements/)** - UI/UX enhancement tracking
  - [UI/UX Analysis](docs/knowledge-base/09-ux-improvements/ui-ux-analysis.md) - Complete analysis and recommendations
- **[Design Guidelines](docs/knowledge-base/10-design-guidelines/)** - archived; frontend rules are in [docs/pastel/](docs/pastel/README.md) (MUST FOLLOW)
  - [Design Guidelines](docs/knowledge-base/10-design-guidelines/design-guidelines.md) - archived; the design system is «Пастель», see [docs/pastel/design-system.md](docs/pastel/design-system.md)
- **[Backend Standards](docs/BACKEND_STANDARDS.md)** - Backend coding standards (MUST FOLLOW)
  - Error handling, Repository patterns, Use Cases, Controllers, Naming conventions
- **[Quick Capture API](docs/QUICK_CAPTURE_API.md)** - Shipped `POST /api/quick-capture` contract, auth, limits
- **[iPhone Action Button Guide](docs/IOS_SHORTCUT_ACTION_BUTTON.md)** - Safe Shortcut→Telegram capture MVP (`FT-076`) plus dev/test direct Shortcut API instructions (`FT-075`); production auth remains a future decision

## Architecture Overview

This project follows **Clean Architecture** principles with clear separation between layers:

### Module System

`createModules()` in `src/appModules.ts` returns **16 app modules**:

1. **TransactionModule** - CRUD operations for transactions + analytics; gets its categories through the `CategoryResolver` port
2. **BudgetModule** - Budget management (depends on TransactionModule; leaves the UI per decision Д2)
3. **DebtModule** - Debt management with payment history (depends on TransactionModule, SubscriptionModule, UserModule; no longer filled from text per Д2)
4. **VoiceProcessingModule** - AI-powered voice/text processing (depends on TransactionModule; the user's categories go into the prompt)
5. **QuickCaptureModule** - `POST /api/quick-capture` over the text pipeline (depends on VoiceProcessingModule)
6. **CategoryModule** - User categories (FT-099): 8 + 8 starters per user, rename, colour, hide; resolves the category of every record
7. **OpenAIUsageModule** - OpenAI API usage monitoring
8. **UserModule** - User management (telegramId → UUID resolution) and settings (FT-098)
9. **SubscriptionModule** - Premium subscriptions with Telegram Stars payments
10. **AccountModule** - Accounts (FT-101): balances on read, the total in сум, the account of every new record
11. **FxModule** - USD rate (FT-102): Central Bank rate by date, loaded at start and hourly until today's is in; the user's own rate
12. **BotMessageModule** - Bot record messages (FT-122): which records each confirmation shows and which keyboard screen is open (`bot_messages`), so «Изменить», «Вернуть» and `/undo` survive a restart
13. **NotificationModule** - Notices the bot sends on its own: the daily summary at the chosen time on the user's clock and the summaries behind `/today` and `/month` (FT-124); the reminders after the audit — a goal at 80% of its limit and over it, a subscription the day before its charge, the audit on the 1st with «Позже» once (FT-133); each sent at most once (`notifications_log`). Depends on TransactionModule, UserModule and AuditModule (through the `ReminderSources` port); its schedulers run in the bot's process
14. **ExportModule** - «Скачать все записи» (FT-126): a CSV of all records and moves that are not deleted — `GET /api/export` downloads it, `POST /api/export/chat` sends it to the chat with the bot (`sendDocument`); reads TransactionModule and AccountModule through the `ExportSources` port
15. **AuthModule** - Web login through the bot (FT-128, decision Д4): a one-time link `t.me/<bot>?start=login_<token>` for 5 minutes (`login_tokens`), «Подтвердить» / «Это не я» in the bot, the browser's httpOnly session cookie read by `webSessionMiddleware` next to initData, «Выйти». No guest mode in the browser any more
16. **AuditModule** - Spending audit and goals (FT-130, FT-131): the audit rules over flexible categories, `audits` (candidates and decisions, carried to the next audit) and `goals`; `/api/audits`, `/api/goals`; reads TransactionModule and CategoryModule through the `AuditSources` port

**Dashboard is not an app module.** `src/modules/dashboard/` contains only `DashboardService` and `DashboardController`; there is no `dashboardModule.ts` and `createModules()` does not return a `dashboardModule`. The dashboard is assembled in the Express delivery layer: `createDashboardRouter()` (`src/delivery/web/express/routes/dashboardRoutes.ts`) builds `DashboardService` from `transactionModule.getAnalyticsService()` and `budgetModule.budgetService`.

### Module Dependencies

```
TransactionModule (core)
    ↑
    ├─── BudgetModule (для расчета spent)
    ├─── DebtModule (для создания linked транзакций)
    └─── VoiceProcessingModule (CreateTransactionUseCase)

DashboardService (не модуль) ← AnalyticsService (Transaction) + BudgetService (Budget),
                                собирается в createDashboardRouter()
```

### Layer Structure

Each module follows Clean Architecture with 4 layers:

- **Domain** - Entities, repository interfaces, business rules
- **Application** - Use cases, services, business logic orchestration
- **Infrastructure** - Repository implementations, external services (OpenAI, Telegram)
- **Presentation** - Controllers, routes, request/response handling

### Entry Points

The application has two main delivery mechanisms:

1. **Express HTTP Server** (`src/delivery/web/express/`) - REST API под `/api` prefix
2. **Telegram Bot** (`src/delivery/messaging/telegram/`) - Bot commands и voice processing

### Data Flow

Voice commands → OpenAI Whisper → GPT-4 Parsing → Transaction Creation → Database (SQLite via TypeORM)
Text input → GPT-4 Parsing → Transaction Creation → Database
HTTP API → Controller → Use Case → Repository → Database

## Key Architectural Decisions

### Why Clean Architecture?
- **Testability** - легко мокировать зависимости и тестировать бизнес-логику изолированно
- **Maintainability** - изменения в одном слое не влияют на другие
- **Flexibility** - смена технологии затрагивает только инфраструктурный слой
- **Scalability** - модульная структура позволяет системе расти постепенно

### Why One Database Path?
- **One implementation per repository** - TypeORM over SQLite; the `supabase-js` repositories were removed in FT-090 (decision Д6), so every new table is written once
- **Migrations, not synchronize** - schema changes are TypeORM migrations applied on start after a backup to `data/backups/`; `synchronize` is off because it cannot convert types or move data
- **Postgres later** - if needed, it becomes another TypeORM `DataSource` behind the same repositories, not a second set of repositories

### Machine Learning System
- Система обучается на пользовательских исправлениях транзакций
- Улучшает категоризацию и распознавание merchant names со временем
- Loads seed patterns from `data/patterns.seed.json` and writes runtime learned patterns to ignored `data/patterns.json`
- Enhances OpenAI prompts с historical data

---

## Architectural Principles (MUST FOLLOW)

### 1. Single Source of Truth

**Принцип:** Каждый тип данных должен иметь единственное место определения.

**Примеры:**
- **Categories**: таблица `categories` — у каждого пользователя свои (FT-099). Источник — `CategoryModule`
  (`src/modules/category/`): стартовые 8 + 8 в `categoryPresets.ts`, остальное — в базе
  - Webapp читает `GET /api/categories` (`useCategories()` в `webapp/src/entities/category`), копии списка нет
  - Бот строит клавиатуры из категорий пользователя (`utils/userCategories.ts`)
  - Промпт ИИ перечисляет видимые категории пользователя (`buildCategoryPrompt`)
  - `src/shared/domain/entities/Category.ts` — только словарь старых 26 + 7 id и синонимов для перевода
    старых значений; новые категории туда не добавляются
- **Transactions**: Entity в `src/modules/transaction/domain/transactionEntity.ts`
- **Budgets**: Entity в `src/modules/budget/domain/Budget.ts`

**Антипаттерн:** Дублирование данных в разных файлах без синхронизации.

### 2. ID vs Display Names

**Принцип:** Хранить в базе ID, показывать пользователю локализованные имена.

| Слой | Формат | Пример |
|------|--------|--------|
| Database | id категории пользователя | `transactions.category_id = "3f1c…"` |
| API Response | id + текущее название | `{ categoryId: "3f1c…", category: "Кафе" }` |
| OpenAI Input/Output | название из списка пользователя | `category: "Кафе"` → `CategoryResolver` → id |
| UI Display | название и цвет категории | по `categoryId` из `useCategories()` |

**Конвертация:** запись получает категорию через `CategoryResolver` (id → своё название → старый id или
синоним → «Другое»); показывать — название и цвет из списка категорий пользователя.

### 3. Normalization at Input

**Принцип:** Нормализовать данные на входе в систему, не на выходе.

**Пример (OpenAI):**
```typescript
// В openAITranscriptionService.ts
const category = normalizeCategory(rawCategory); // всегда ID
```

**Почему:** Единообразие данных в БД упрощает запросы и matching.

### 4. MVP First, Then Extend

**Принцип:** Начинать с простого решения, расширять при необходимости.

**Пример (Categories):**
- **Было (MVP)**: статические категории в коде
- **Стало (FT-099)**: категории пользователя в базе, стартовый набор 8 + 8 из дизайна

**Как применять:**
- Когда пользователь предлагает сложное решение, спросить: "Это нужно для MVP?"
- Проектировать архитектуру так, чтобы расширение было простым
- Не добавлять функционал "на будущее" без явного запроса

### 5. Ask Before Deep Dive

**Принцип:** Спрашивать пользователя перед углублением в сложные решения.

**Когда спрашивать:**
- Есть несколько подходов (простой vs сложный)
- Требование может быть избыточным для MVP
- Изменение затрагивает архитектуру

**Пример вопроса:**
> "Это можно сделать двумя способами:
> 1. Простой: статические категории в коде (15 мин)
> 2. Сложный: динамические из БД + UI для управления (2 часа)
>
> Для MVP хватит простого варианта. Какой выбираем?"

---

## Shared Entities

### Categories (FT-099, FT-100)

**Где:** `src/modules/category/` — домен (`category.ts`, `categoryPresets.ts`), `CategoryCatalog`,
`GET/POST /api/categories`, `PATCH /api/categories/:id`. Контракт — `docs/pastel/api.md`.

```typescript
interface Category {
  id: string;            // uuid
  userId: string;
  type: 'expense' | 'income';
  name: string;          // «Кафе»; уникально у пользователя в пределах типа, без учёта регистра и ё
  color: CategoryColor;  // один из 8 пастельных токенов
  isHidden: boolean;
  isOther: boolean;      // «Другое» — не скрывается
  sortOrder: number;
  presetKey: string | null; // ключ стартовой категории ('cafe'); у своих null
}
```

**Правила:**
- Запись хранит `category_id`; категорию для записи даёт `CategoryResolver` (порт модуля транзакций).
- Ввод текстом и голосом выбирает только видимые категории; нераспознанное — «Другое» того же типа.
- Выученные паттерны хранят `presetKey`, а не названия: названия у каждого пользователя свои.
- Старый словарь `src/shared/domain/entities/Category.ts` нужен только для перевода старых значений
  (старые записи, кнопки бота в старых сообщениях, синонимы — подсказки ИИ). Список в webapp удалён.

## Documentation Maintenance Rules

**IMPORTANT**: Claude Code должен автоматически обновлять документацию при значительных изменениях.

### Когда обновлять документацию

После выполнения следующих типов изменений, **проактивно обновить соответствующую документацию**:

#### 1. Архитектурные изменения → `docs/knowledge-base/01-architecture/`

**Triggers:**
- ✅ Добавлен новый модуль
- ✅ Изменены зависимости между модулями
- ✅ Добавлен новый design pattern
- ✅ Изменена структура слоев (domain/application/infrastructure)

**Обновить:**
- `modules.md` - если добавлен/удален модуль или изменены зависимости
- `patterns.md` - если использован новый паттерн
- `overview.md` - если изменилась общая структура

#### 2. Data Flow изменения → `docs/knowledge-base/07-data-flow/`

**Triggers:**
- ✅ Изменен процесс обработки voice → transaction
- ✅ Добавлены новые middleware в API lifecycle
- ✅ Изменена логика расчета budget spent
- ✅ Добавлен новый критичный поток данных

**Обновить:**
- Соответствующий `.md` файл с описанием измененного потока
- Обновить mermaid диаграмму, если изменился flow

#### 3. Development изменения → `docs/knowledge-base/08-development/`

**Triggers:**
- ✅ Изменены команды запуска (npm scripts)
- ✅ Добавлены новые environment variables
- ✅ Изменен процесс database migration
- ✅ Добавлены новые частые проблемы и их решения

**Обновить:**
- `quick-start.md` - новые env vars, команды
- `database-guide.md` - изменения в database setup
- `troubleshooting.md` - новые проблемы и решения

#### 4. CLAUDE.md обновления

**Triggers:**
- ✅ Изменены основные команды разработки
- ✅ Добавлены новые модули (обновить Module System секцию)
- ✅ Изменены environment variables

### Процесс обновления

**Шаги:**

1. **Оценка изменений** - после завершения feature/fix определить, нужно ли обновление
2. **Определить файлы** - какие документы затронуты
3. **Обновить содержимое** - внести изменения в документацию
4. **Проверить ссылки** - убедиться, что внутренние ссылки работают
5. **Уведомить пользователя** - сообщить, какая документация обновлена

### Примеры автоматического обновления

**Пример 1: Добавлен NotificationModule**
```
После создания:
1. Обновить docs/knowledge-base/01-architecture/modules.md
   - Добавить NotificationModule в таблицу
   - Обновить mermaid граф зависимостей
2. Обновить CLAUDE.md
   - Добавить в список модулей (Module System секция)
3. Сообщить: "✅ Документация обновлена: modules.md, CLAUDE.md"
```

**Пример 2: Изменен voice processing flow**
```
После изменения:
1. Обновить docs/knowledge-base/07-data-flow/voice-to-transaction.md
   - Описать новые шаги
   - Обновить mermaid диаграмму
2. Сообщить: "✅ Документация обновлена: voice-to-transaction.md"
```

**Пример 3: Добавлен новый env var**
```
После добавления DATABASE_POOL_SIZE:
1. Обновить CLAUDE.md (Environment Configuration)
2. Обновить docs/knowledge-base/08-development/quick-start.md
3. Сообщить: "✅ Документация обновлена: CLAUDE.md, quick-start.md"
```

### Что НЕ требует обновления

❌ Мелкие bug fixes
❌ Refactoring без изменения API/структуры
❌ Добавление комментариев
❌ Форматирование кода
❌ Обновление dependencies без breaking changes

### Уведомление пользователю

После обновления документации сообщить:
```
✅ Документация обновлена:
- docs/knowledge-base/01-architecture/modules.md - добавлен NotificationModule
- CLAUDE.md - обновлена секция Module System

Изменения отражают добавление NotificationModule с зависимостью от TransactionModule.
```

---

## Task Workflow — Current Source of Truth (MUST FOLLOW)

**Current decision (2026-08-16):** `TASKS.md` is the active source of truth for the relaunch/local-daily-use plan. GitHub Issues/Project/Wiki are useful but may be stale; do not create/move/close issues unless the active task explicitly asks for GitHub reconciliation (for example FT-049).

### Local Task Board

- Read the «Текущий фокус» section of `TASKS.md` before starting work; the task to implement is under «В работе».
- Layout: `TASKS.md` (в работе + очередь + таблица backlog) · [`docs/tasks/README.md`](docs/tasks/README.md) (правила, статусы, роли) · [`docs/tasks/decisions.md`](docs/tasks/decisions.md) (лог решений, новые сверху) · [`docs/tasks/backlog.md`](docs/tasks/backlog.md) (отложенные задачи) · [`docs/tasks/archive/`](docs/tasks/archive/) (закрытые задачи с отчётами).
- When Hermes closes a task, move its whole body to the matching file in `docs/tasks/archive/` — do not keep `done` tasks on the board.
- Work on exactly one FT task at a time.
- Claude Code may implement and run tests, but Hermes is the final QA gate and marks tasks `done`.
- Before `done`, Hermes verifies real output: diff, targeted tests, `npm run verify`, and screenshot/API smoke when relevant.
- Do not force push, reset, delete branches/files, deploy, or apply external DB migrations without explicit permission.

### GitHub Project Board (currently secondary / reconcile via FT-049)

- **Project:** "Finance Tracker Development" — https://github.com/users/chollak/projects/1
- **Колонки:** Backlog → In Progress → Review → Done
- Treat GitHub task state as potentially stale until FT-049 reconciles it with `TASKS.md`.
- If an issue is already known and relevant, reference it in commits/PRs; otherwise do not block local FT work on issue creation.

### Milestones

| Milestone | Фокус |
|-----------|-------|
| v1.1 — Core Features | Recurring, Export, Quick-add |
| v1.2 — Analytics & Insights | Analytics v2, UX фиксы, Drawer, Tabs |
| v1.3 — Growth & Monetization | Multi-currency, Savings, Onboarding, Telegram insights |

### GitHub Wiki (secondary unless task asks for it)

- **URL:** https://github.com/chollak/finance-tracker-backend/wiki
- **Repo:** клонировать `finance-tracker-backend.wiki.git` в `/tmp/finance-tracker-wiki` для редактирования

**Страницы Wiki:**

| Страница | Содержание | Когда обновлять |
|----------|-----------|-----------------|
| Home | Навигация по wiki | При добавлении новых страниц |
| Architecture Overview | Clean Architecture, слои, data flow | При изменении архитектуры |
| Module System | 16 модулей, зависимости | При добавлении/удалении модуля |
| Design Patterns | Repository, Use Case, Result, DI | При использовании нового паттерна |
| Quick Start | Установка, запуск, env vars | При изменении процесса запуска |
| API Reference | Все endpoints | При добавлении/изменении endpoint |
| Environment Variables | Все env vars | При добавлении новой переменной |
| Design Guidelines | Цвета, шрифты, правила UI | При изменении design system |
| Roadmap | Milestones, ICE scores, план | При создании/закрытии milestones |
| Product Decisions | Лог ключевых решений | При каждом значимом решении |
| Competitors | Анализ конкурентов, gap analysis | При competitive research |

**Процесс обновления Wiki:**
1. `git clone https://github.com/chollak/finance-tracker-backend.wiki.git /tmp/finance-tracker-wiki`
2. Редактировать `.md` файлы (имена через дефис: `Module-System.md`)
3. `cd /tmp/finance-tracker-wiki && git add -A && git commit -m "docs: ..." && git push`

**Current rule:** update repo docs (`CLAUDE.md`, `docs/knowledge-base/`, `TASKS.md`, `AUTONOMOUS_REPORT.md`) first. Update GitHub Wiki only when the task explicitly includes Wiki/GitHub reconciliation or Shukur asks for it.

### GitHub Issues

**Когда создавать Issues:**
- Технический долг и рефакторинг → лейбл `tech-debt`
- Новые фичи → лейбл `feature`
- Баги → лейбл `bug`
- Долгосрочные планы → Issues + привязка к milestone
- **Используй Issue Templates** (Bug Report, Feature Request, Task) — они в `.github/ISSUE_TEMPLATE/`

**Доступные лейблы:**
- `tech-debt` - Технический долг
- `refactoring` - Рефакторинг кода
- `feature` - Новая функциональность
- `bug` - Баг/ошибка
- `documentation` - Документация
- `priority:high` / `priority:medium` / `priority:low` - Приоритет
- `backend` / `frontend` - Область
- `growth` / `ux` / `analytics` / `monetization` - Категория
- `blocked` - Заблокировано зависимостью

### GitHub Reconciliation Workflow (only when doing FT-049 or explicit GitHub work)

1. Inspect existing issues/project state.
2. Mark each open issue as done / still actual / re-scoped / obsolete.
3. Update `TASKS.md` and `CLAUDE.md` so agents have one source-of-truth rule.
4. Only then create/move/close issues or update Project Board.
5. For normal local FT tasks, skip this GitHub workflow unless explicitly requested.

### Commits

**Формат коммитов:**
```
type(scope): краткое описание

[опционально: подробное описание]

[опционально: fixes #123, closes #123]
```

**Types:**
- `feat` - Новая функциональность
- `fix` - Исправление бага
- `refactor` - Рефакторинг без изменения функциональности
- `docs` - Документация
- `test` - Тесты
- `chore` - Обслуживание (deps, configs)

**Примеры:**
```bash
feat(transaction): add bulk archive endpoint
fix(auth): resolve telegram webapp validation
refactor(repository): extract base class for Supabase repos
docs: update CLAUDE.md with GitHub workflow
```

**Связь с Issues:**
- Всегда ссылаться на issue если он есть: `fixes #70`, `closes #70`, `refs #70`
- В PR описании указывать связанные issues

### Pull Requests

**Когда создавать PR:**
- Значительные изменения (новые фичи, рефакторинг)
- Изменения требующие review
- Работа над issue

**Формат PR:**
```markdown
## Summary
- Краткие буллеты что изменено

## Related Issues
Fixes #123

## Test Plan
- [ ] Unit tests pass
- [ ] Manual testing done
- [ ] Tested on SQLite

## Screenshots (if UI changes)
```

### Работа с Issues в Claude Code

**Просмотр issues:**
```bash
gh issue list                    # Все открытые
gh issue list --label tech-debt  # По лейблу
gh issue view 70                 # Конкретный issue
```

**Создание issue:**
```bash
gh issue create --title "Title" --label "tech-debt" --body "Description"
```

**Закрытие через коммит:**
```bash
git commit -m "refactor(repo): extract base class

fixes #70"
```

### Приоритеты хранения информации

| Тип информации | Где хранить |
|----------------|-------------|
| Задача в работе и очередь | `TASKS.md` |
| Отложенные задачи | `docs/tasks/backlog.md` |
| Закрытые задачи с отчётами | `docs/tasks/archive/` |
| Решения, менявшие направление | `docs/tasks/decisions.md` |
| Будущая GitHub-синхронизация | FT-049, then GitHub Issues/Project if Shukur confirms |
| Архитектурные решения | GitHub Wiki (Product Decisions) + `docs/knowledge-base/` |
| API документация | GitHub Wiki (API Reference) |
| Конкурентный анализ | GitHub Wiki (Competitors) |
| Временные заметки сессии | `.claude/plans/` (локально, не в git) |

---

## Design System (WebApp Frontend) — «Пастель»

**IMPORTANT: All frontend work follows the design system «Пастель» (milestone 10).** Rules: [`docs/pastel/design-system.md`](docs/pastel/design-system.md); one spec per component: [`docs/pastel/components/`](docs/pastel/components/); screens: the canvas linked from [`docs/pastel/README.md`](docs/pastel/README.md). The older guides in `docs/knowledge-base/10-design-guidelines/` are archived.

### Quick Reference (MUST FOLLOW)

| Aspect | Rule |
|--------|------|
| **Font** | Manrope 500–800, self-hosted (`@fontsource-variable/manrope`, `fonts.css`). The design system names Google Fonts — we self-host on purpose; `npm run check:fonts` fails on any font CDN |
| **Colour** | Neutral base, one contrast accent (`primary`), pastel only as backgrounds of category tiles/dots and month tiles, text on pastel always `pastel-ink`. Income green with «+», expenses `ink` with «−». No gradients, no card shadows, no emoji |
| **Themes** | Light and dark from the same tokens. Theme: «как в Telegram» (`colorScheme`), light or dark (`ThemeController`, `useTheme`) |
| **Numbers** | Integer minor units in code; shown with sign, unit and non-breaking groups via `formatMinor()`; tabular figures everywhere |
| **Shape** | Everything pressable is a pill or circle; cards `rounded-card` (24px), balance card and sheets `rounded-hero` (28px) |
| **Touch** | At least 44px (`size-touch`); main button and quick input 56px (`h-button`) |
| **Popups** | Only the bottom `Sheet`; deleting has no confirm dialog — a toast with «Отменить» (`showUndoToast` with a real undo) |
| **Copy** | Russian, short, verbs on buttons; labels must survive +30% (Uzbek) |

### Where things are

- **Tokens:** `docs/pastel/tokens.json` → `npm run tokens:pastel` → `webapp/src/app/styles/pastel-tokens.css` and `webapp/src/shared/config/pastelTokens.ts` (generated, never edit; `npm run check:tokens` is part of verify).
- **Tailwind names:** Pastel colours `bg-bg`, `text-ink`, `text-ink-muted`, `bg-track`, `bg-sheet`, `bg-sheet-card`, `border-line`, `bg-pastel-mint`…; radii `rounded-tile|control|card|hero|pill`; sizes `h-touch|key|control|button|row`; text styles `type-balance`, `type-section`, `type-label`, `type-body`, `type-body-strong`, `type-button`… The shadcn names (`bg-background`, `text-muted-foreground`, `bg-primary`…) map to Pastel tokens so not-yet-redesigned screens follow the theme.
- **Components:** `webapp/src/shared/ui/pastel/` — `Button`, `Segmented`, `SwitchRow`, `ChoiceChips`, `SettingsSection`/`SettingsRow`, `CategoryDot`, `CategoryTile`, `ProblemScreen`, `SkeletonBlock`, `Keypad`, `UndoToast`, `Sheet`, `CategoryPicker`, `AccountPicker`, `CalendarSheet`, `OfflineBar`. New screens use these; shadcn primitives in `shared/ui` stay only for screens not yet redesigned and go away with them.
- **Logic helpers:** `shared/lib/money` (format, keypad), `shared/lib/undo` (toast stack), `shared/lib/dates` (local dates, calendar), `shared/lib/theme`, `shared/lib/pastel` (category colours), `shared/lib/offline` (connection state, Dexie outbox, reads kept for the offline mode — FT-129).
- **Showcase:** `/dev/pastel` renders the components side by side in light and dark (sheets and toasts open in the page theme — switch the system theme to see the other), with a +30% label switch. `/dev/*` pages ship in builds on purpose (the voice check must run inside the Mini App) but are not linked. Check new components there before using them on screens.
- **Acceptance:** a screen is compared by screenshot with its canvas board (task field `Design`), light and dark, at 390px.

## Common Development Tasks

### Adding a New Use Case

1. Create use case class в `src/modules/{module}/application/`
2. Add to module's constructor и getter method
3. Create controller method в `src/modules/{module}/presentation/`
4. Add route в `src/delivery/web/express/routes/`

See: [Adding Features Guide](docs/knowledge-base/08-development/adding-features.md)

### Adding a New API Endpoint

1. Create/reuse Use Case
2. Add controller method
3. Register route
4. Test with curl/Postman

See: [Adding Features Guide](docs/knowledge-base/08-development/adding-features.md)

### Changing Database Schema

1. Change the entity in `src/shared/infrastructure/database/entities/`
2. Add a migration class in `src/shared/infrastructure/database/migrations/` and list it in `migrations/index.ts`
3. Test it on a real SQLite file in a temp dir (see `tests/databaseMigrations.test.ts`): data kept, `findSchemaDrift()` empty
4. `npm run migration:show` shows pending migrations and any entity/schema drift; `npm run migration:run` applies them after a backup (the app also does this on start); `npm run migration:revert` undoes the last one after a backup

Never turn `synchronize` back on. See: [Database Guide](docs/knowledge-base/08-development/database-guide.md)

### Adding a New Module

1. Create folder structure: `src/modules/{module}/{domain,application,infrastructure,presentation}/`
2. Define domain entities и repository interfaces
3. Implement use cases и services
4. Create the repository implementation (TypeORM) and a migration for its tables
5. Add module class with factory method
6. Register в `src/appModules.ts`
7. Add routes if needed

See: [Adding Features Guide](docs/knowledge-base/08-development/adding-features.md)

## Project Structure Notes

- **Source**: All TypeScript code in `src/` compiles to `dist/`
- **Frontend**: React app in `webapp/` builds to `public/webapp/` for Express serving
- **Tests**: Jest tests in `tests/` folder with `.test.ts` suffix
- **Static Assets**: Express serves webapp at `/webapp` path and API at `/api`

## Integration Points

- **Database**: SQLite via TypeORM, schema managed by migrations
- **OpenAI**: Voice transcription using openai package
- **Telegram**: Bot interface using telegraf package
- **Express**: HTTP server with custom CORS headers and multer for file uploads
