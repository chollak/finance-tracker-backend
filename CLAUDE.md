# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Current Operating Mode — READ FIRST

**Goal now:** довести существующий Telegram-first finance tracker до состояния «одной кнопкой поднял и пользуюсь сам локально». Do not rebuild broad product areas or revive old production/AWS plans.

**Source of truth for current work:** `TASKS.md` Active Plan. GitHub Issues/Wiki may contain stale January-era planning; use them only when a task explicitly asks to reconcile them.

**Runtime target now:** local WSL + SQLite + Telegram polling + Cloudflare quick tunnel for Mini App phone testing. Production/AWS is intentionally parked; `sapaev.uz` and Supabase are not the active dev path.

**Home/Capture UX (2026-09-04):** Home первого экрана — минимальный quick capture: заголовок со статусом, карточка ввода, недавние транзакции и attention-блок, который ничего не рисует без реального сигнала. `BalanceCard`, budget overview, premium/usage limits и trust summary убраны с первого флоу Home, но **не удалены**: компоненты и маршруты живут и доступны из «Ещё» (`FT-073`). Карточка ввода показывает три способа записи — «Чек» (`Скоро`, недоступен), «Голос» (честная подсказка: диктовка работает в чате бота, не в Mini App) и «Текстом» (работает здесь), плюс offline-нотис вместо приёма ввода без сети (`FT-074`).

**Current implementation queue (2026-09-04):** `FT-059 → FT-060 → FT-061`. Work one FT task at a time. Безопасный план quick capture закрыт полностью: гайд «как записывать операции» через Telegram (`FT-076`, `docs/IOS_SHORTCUT_ACTION_BUTTON.md`) и прямой Shortcut-вызов `POST /api/quick-capture` **для dev/test** (`FT-075`). Dev/test-контур: `X-Shortcut-User-Id` задаёт владельца и принудительно ставит `source=ios_shortcut`, опциональный `SHORTCUT_CAPTURE_TOKEN` проверяется через `X-Shortcut-Capture-Token` (плейсхолдер есть в `.env.example`), а при `NODE_ENV=production` весь обход отвергается с 403 `SHORTCUT_CAPTURE_DISABLED`. Это **не продовая auth-модель**: продовый токен (выдача, срок жизни, отзыв, отдельный rate limit для не-Telegram источника) — будущее решение Шукура, а не текущий блокер. Не включать обход в проде и не класть реальные токены в клиентские инструкции. `FT-049`/`FT-050` (GitHub-сверка, ветки) требуют явного разрешения на внешние действия. The live semantic smoke (`FT-044`), its debt-linked transaction bug (`FT-072`), read-only historical semantic preview (`FT-045`), budgets page UX cleanup (`FT-055`), transaction row readability (`FT-056`), collapsed semantic corrections (`FT-057`), touch target compliance (`FT-058`), the minimal Home/Capture slice (`FT-073`), the capture action row/states (`FT-074`), the iPhone Action Button guide (`FT-076`), and the dev/test Shortcut capture API (`FT-075`) are done/verified locally. Do not apply data backfills, close GitHub issues, delete branches, touch production/Supabase, or change product-policy without the explicit stop/ask rules below.

**Stop/ask before:** production deploys, Supabase SQL/migrations, billing/subscription policy changes, rate-limit policy changes, broad Home/product IA decisions, destructive branch deletion, force dependency upgrades (`npm audit fix --force`).

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
- `DATABASE_TYPE` - Database type: `sqlite` (default) or `supabase`

**For Supabase (when DATABASE_TYPE=supabase):**
- `SUPABASE_URL` - Supabase project URL
- `SUPABASE_ANON_KEY` - Supabase anonymous key
- **Supabase Project ID:** `cttsquvkvkwtxsfrgsrs` (historical value; verify before use — current local work uses SQLite and Supabase is paused)
- **Test User telegramId:** `597843119` (Konan) - only for approved Supabase testing; do not modify Supabase without explicit permission
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
  - [Modules](docs/knowledge-base/01-architecture/modules.md) - 7 модулей системы
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
  - [Database Guide](docs/knowledge-base/08-development/database-guide.md) - SQLite vs Supabase
  - [Troubleshooting](docs/knowledge-base/08-development/troubleshooting.md) - Common issues
  - [Test Logging & Contract Cleanup](docs/knowledge-base/08-development/test-logging-and-contract-cleanup.md) - FT-017 findings and cleanup plan
  - [Task Workflow](docs/knowledge-base/08-development/task-workflow.md) - TASKS.md vs GitHub Issues decision
  - [API Route Coverage Matrix](docs/knowledge-base/08-development/api-route-coverage-matrix.md) - FT-022 route coverage audit
- **[UX Improvements](docs/knowledge-base/09-ux-improvements/)** - UI/UX enhancement tracking
  - [UI/UX Analysis](docs/knowledge-base/09-ux-improvements/ui-ux-analysis.md) - Complete analysis and recommendations
- **[Design Guidelines](docs/knowledge-base/10-design-guidelines/)** - Frontend design rules (MUST FOLLOW)
  - [Design Guidelines](docs/knowledge-base/10-design-guidelines/design-guidelines.md) - Complete design system rules
- **[Backend Standards](docs/BACKEND_STANDARDS.md)** - Backend coding standards (MUST FOLLOW)
  - Error handling, Repository patterns, Use Cases, Controllers, Naming conventions
- **[Quick Capture API](docs/QUICK_CAPTURE_API.md)** - Shipped `POST /api/quick-capture` contract, auth, limits
- **[iPhone Action Button Guide](docs/IOS_SHORTCUT_ACTION_BUTTON.md)** - Safe Shortcut→Telegram capture MVP (`FT-076`) plus dev/test direct Shortcut API instructions (`FT-075`); production auth remains a future decision

## Architecture Overview

This project follows **Clean Architecture** principles with clear separation between layers:

### Module System

`createModules()` in `src/appModules.ts` returns **7 app modules**:

1. **TransactionModule** - CRUD operations for transactions + analytics
2. **BudgetModule** - Budget management (depends on TransactionModule)
3. **DebtModule** - Debt management with payment history (depends on TransactionModule, SubscriptionModule, UserModule)
4. **VoiceProcessingModule** - AI-powered voice/text processing (depends on TransactionModule, DebtModule)
5. **OpenAIUsageModule** - OpenAI API usage monitoring
6. **UserModule** - User management (telegramId → UUID resolution)
7. **SubscriptionModule** - Premium subscriptions with Telegram Stars payments

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

Voice commands → OpenAI Whisper → GPT-4 Parsing → Transaction Creation → Database (SQLite/Supabase)
Text input → GPT-4 Parsing → Transaction Creation → Database
HTTP API → Controller → Use Case → Repository → Database

## Key Architectural Decisions

### Why Clean Architecture?
- **Testability** - легко мокировать зависимости и тестировать бизнес-логику изолированно
- **Maintainability** - изменения в одном слое не влияют на другие
- **Flexibility** - легко менять технологии (например, переключаться между SQLite и Supabase)
- **Scalability** - модульная структура позволяет системе расти постепенно

### Why Dual Database Support?
- **Development** - SQLite для быстрого старта без облачных зависимостей
- **Production** - Supabase для масштабирования и real-time возможностей
- **Migration Path** - постепенный переход от MVP к production-ready solution
- **Implementation** - Repository Pattern + Factory для seamless switching

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
- **Categories**: `src/shared/domain/entities/Category.ts` - единственный источник категорий
  - OpenAI prompts используют `generateCategoryPrompt()` из этого файла
  - Frontend копирует структуру (без aliases) в `webapp/src/entities/category/model/categories.ts`
  - Telegram bot импортирует из shared entity
- **Transactions**: Entity в `src/modules/transaction/domain/Transaction.ts`
- **Budgets**: Entity в `src/modules/budget/domain/Budget.ts`

**Антипаттерн:** Дублирование данных в разных файлах без синхронизации.

### 2. ID vs Display Names

**Принцип:** Хранить в базе ID, показывать пользователю локализованные имена.

| Слой | Формат | Пример |
|------|--------|--------|
| Database | ID | `"utilities"`, `"food"` |
| API Response | ID | `{ category: "utilities" }` |
| OpenAI Input/Output | ID | `category: "food"` |
| UI Display | Localized name | `"Коммунальные"`, `"Еда"` |

**Конвертация:** Используй `getCategoryById(id)?.name` для отображения.

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
- **MVP**: Статические категории в коде
- **Будущее**: Динамические из БД + пользовательские

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

### Category Entity

**Location:** `src/shared/domain/entities/Category.ts`

**Структура:**
```typescript
interface Category {
  id: string;        // English ID: "food", "utilities"
  name: string;      // Russian name: "Еда", "Коммунальные"
  type: 'income' | 'expense' | 'both';
  icon: string;      // Emoji: "🍔", "💡"
  aliases: string[]; // Для matching: ["еда", "ресторан", "кафе"]
}
```

**Использование:**
- `getCategoryById(id)` - получить по ID
- `getCategoryByAlias(text)` - найти по русскому тексту
- `normalizeCategory(input)` - всегда вернуть ID
- `generateCategoryPrompt()` - для OpenAI prompts

**Синхронизация Frontend:**
- Frontend имеет копию без `aliases` в `webapp/src/entities/category/model/categories.ts`
- При изменении категорий - обновить оба файла

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

- Read `TASKS.md` Active Plan before starting work.
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
| Module System | 7 модулей, зависимости | При добавлении/удалении модуля |
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
- [ ] Tested on Supabase

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
| Текущие задачи relaunch/local daily use | `TASKS.md` |
| Будущая GitHub-синхронизация | FT-049, then GitHub Issues/Project if Shukur confirms |
| Архитектурные решения | GitHub Wiki (Product Decisions) + `docs/knowledge-base/` |
| API документация | GitHub Wiki (API Reference) |
| Конкурентный анализ | GitHub Wiki (Competitors) |
| Временные заметки сессии | `.claude/plans/` (локально, не в git) |

---

## Design System (WebApp Frontend)

**IMPORTANT: All frontend changes MUST follow the [Design Guidelines](docs/knowledge-base/10-design-guidelines/design-guidelines.md)**

### Quick Reference (MUST FOLLOW)

| Aspect | Rule |
|--------|------|
| **Style** | Minimal & Clean — lots of whitespace, no decorative elements |
| **Font** | Onest, Cyrillic-friendly; follow current tokens/docs before changing weights |
| **Colors** | Neutral UI chrome; green/red/orange only for semantic money/status roles |
| **Border Radius** | Shared `Card` default is `rounded-2xl`; feature/status cards may opt into larger radius intentionally |
| **Animations** | Fade-in 300ms, Hover 150ms, Stagger 50ms |
| **Touch Targets** | Minimum 44x44px, prefer 48x48px |
| **Approach** | Mobile-first, then scale up |

### Design Anti-Patterns (AVOID)
- Purple/violet gradients (AI slop aesthetic)
- Colorful dashboard treatment where colors do not carry semantic meaning
- Heavy shadows
- Animations longer than 600ms
- Introducing new ad-hoc font sizes/weights instead of shared tokens/components
- Decorative borders on cards

For current visual direction, read `docs/knowledge-base/10-design-guidelines/style-direction.md` before UI work. Some older guideline text may still be reconciled under FT-059; prefer the active implementation + style-direction doc when they conflict.

The webapp uses a **shadcn/ui-based design system** (Radix primitives + Tailwind CSS + `class-variance-authority`), implementing a modern, mobile-first finance tracker interface. There is no separate `design-system/` package — shared primitives live directly in `shared/ui/` (Feature-Sliced Design layout: `app/entities/features/pages/shared/widgets`).

### Design System Structure

**Location:** `webapp/src/shared/ui/`

Shared primitives (`button.tsx`, `card.tsx`, `badge.tsx`, `input.tsx`, `dialog.tsx`, `alert-dialog.tsx`, `progress.tsx`, `skeleton.tsx`, `dock.tsx`, etc.), plus page-shell helpers in `layout.tsx` and `typography.tsx` (`PageShell`, `SectionStack`, `PageHeader`, `FormPageHeader`, `AmountText`, `MetricStat`).

### Design Tokens

**File:** `webapp/src/app/styles/globals.css` (`@theme inline` block)

Centralized CSS variables:
- **Base colors:** `background`, `foreground`, `card`, `primary`, `secondary`, `muted`, `accent`, `destructive`, `border`, `input`, `ring`
- **Semantic finance colors:** `income` (green), `expense` (red), `warning` (orange), `success` (green) — each with `-foreground` and `-muted` variants
- **Border radius scale:** `sm` 8px, `md` 12px, `lg` 16px, `xl` 20px, `2xl` 24px (standard cards), `3xl` 32px (modals/feature cards only), `full` pill
- **Animation timing:** `duration-fast/normal/slow`, `ease-out/in-out/spring`

There are no `lime`/`lavender` accent colors — those were removed as part of the design-system cleanup. **One accent per view**: neutral UI chrome (`primary`/`secondary`/`muted`) for structure, semantic tokens (`income`/`expense`/`warning`/`success`/`destructive`) only where they explain financial meaning. Never hardcode raw Tailwind palette colors (`red-*`, `purple-*`, etc.) for UI state — use the semantic tokens above.

### UI Components

**Import pattern:**
```typescript
import { Button } from '@/shared/ui/button';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/shared/ui/card';
import { Badge } from '@/shared/ui/badge';
```

**Button variants:** `default` (dark, primary actions) · `destructive` · `outline` · `secondary` · `ghost` · `link` · `income` · `expense`

**Badge variants:** `default` · `secondary` · `destructive` · `outline` · `income` · `expense` · `warning` · `success`

**Card:** single primitive, `rounded-2xl` (24px, standard card radius) by default — pass an explicit `rounded-3xl` only for modals/feature cards that intentionally opt into the larger radius.

**Example usage:**
```tsx
<Button variant="income" size="lg">
  Add Income
</Button>

<Card className="p-5">
  <CardHeader><CardTitle>Balance</CardTitle></CardHeader>
  <CardContent>...</CardContent>
</Card>
```

### Key Features

1. **Dynamic Font Sizing** - `AmountText`/`BalanceCard` scale text based on amount magnitude
2. **Responsive Design** - Mobile-first with breakpoints (md: 768px, lg: 1024px)
3. **Hybrid Navigation** - `Dock` (mobile bottom nav) + top nav (desktop)
4. **Consistent Animations** - Fade-in, slide-up, stagger effects (see Animation Classes below)
5. **TypeScript Typed** - Full type safety for all components

### Feature Components

- **`widgets/balance-card/`** - Dark card showing balance with dynamic font sizing
- **`entities/transaction/ui/`** - `TransactionCard`, `TransactionListItem`, `TransactionActions`
- **`entities/budget/ui/BudgetCard.tsx`** - Budget progress card with alerts
- **`shared/ui/dock.tsx`** - Bottom navigation (mobile) with centered `+` action

### Responsive Breakpoints

```css
/* Mobile-first approach */
default: mobile (< 768px)
md: tablet (≥ 768px)
lg: desktop (≥ 1024px)
```

### Animation Classes

Available in `webapp/src/app/styles/globals.css`:
- `.animate-fade-in` / `.animate-fade-in-up` - Fade in with slight upward movement
- `.animate-slide-in-up` - Slide up from bottom
- `.animate-scale-in` - Scale-up entrance
- `.stagger-1` … `.stagger-8` - 50ms-increment stagger delays for list items

### Adding New Components

1. Create `ComponentName.tsx` in `webapp/src/shared/ui/` (shared primitive) or the relevant `entities/`/`widgets/`/`features/` slice (feature-specific component)
2. Use `cva` for variant-based components (see `button.tsx`/`badge.tsx` for the pattern)
3. Reference design tokens (`globals.css` CSS variables) for colors, spacing, radius — never hardcode raw Tailwind palette colors
4. Export via the slice's `index.ts` barrel

### Styling Guidelines

- Use Tailwind utility classes (configured via `@theme inline` in `globals.css`, no `tailwind.config.js` color overrides needed)
- Reference design tokens for colors, spacing, shadows
- Standard cards: `rounded-2xl` (24px); reserve `rounded-3xl` (32px) for modals/feature cards
- Use `overflow-hidden` to prevent text overflow
- Apply `break-all` for long numbers/text that needs wrapping
- Include hover states for interactive elements
- Add active states with `active:scale-95` for touch feedback

For detailed component documentation, see: [Design System Guide](docs/knowledge-base/08-development/design-system.md)

---

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

**SQLite:**
- Modify entity в `src/shared/infrastructure/database/entities/`
- Auto-sync in development (`synchronize: true`)

**Supabase:**
- Write migration SQL в `migrations/` folder
- Execute в Supabase SQL Editor
- Update repository implementations if needed

See: [Database Guide](docs/knowledge-base/08-development/database-guide.md)

### Adding a New Module

1. Create folder structure: `src/modules/{module}/{domain,application,infrastructure,presentation}/`
2. Define domain entities и repository interfaces
3. Implement use cases и services
4. Create repository implementations (SQLite + Supabase)
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

- **Database**: SQLite for local/default storage, Supabase for production/cloud storage
- **OpenAI**: Voice transcription using openai package
- **Telegram**: Bot interface using telegraf package
- **Express**: HTTP server with custom CORS headers and multer for file uploads
