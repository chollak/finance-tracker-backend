# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

**Build and Run:**
- `npm run build` - Compile TypeScript to JavaScript in `dist/` folder
- `npm run serve` - Run the compiled application from `dist/index.js`

**Development (Choose one):**
- `npm run dev:full` - 🚀 **RECOMMENDED**: Full-stack development with hot reload
  - Backend: http://localhost:3000 (API + static files)
  - Frontend: http://localhost:5173 (React dev server with hot reload)
  - API calls automatically proxy from frontend to backend
- `npm run dev` - Backend only (serves static production build)
- `npm run dev:frontend` - Frontend only (requires backend running separately)
- `npm run dev:backend` - Backend only (same as `npm run dev`)

**Testing:**
- `npm test` - Run Jest tests (located in `tests/` folder)
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
- **Supabase Project ID:** `cttsquvkvkwtxsfrgsrs` (for MCP tools and dashboard access)
- **Test User telegramId:** `597843119` (Konan) - use for testing on Supabase, safe to modify/delete data
- **Production Domain:** `https://sapaev.uz`

**Logging:**
- `LOG_LEVEL` - Log level: `error`, `warn`, `info` (default), `debug`

**Legacy Notion support (deprecated):**
- `NOTION_API_KEY` - For database operations
- `NOTION_DATABASE_ID` - Target Notion database ID

The application validates these on startup and will exit with descriptive errors if required variables are missing.

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

**Log Categories:** `SYSTEM`, `AUTH`, `RATE_LIMIT`, `TRANSACTION`, `DEBT`, `BUDGET`, `OPENAI`, `TELEGRAM`, `HTTP`, `LEARNING`

**Output Format:**
- Development: Colorized, human-readable
- Production: JSON (for log aggregators)

## Documentation

For detailed documentation, see **[docs/knowledge-base/](docs/knowledge-base/)**:

- **[Architecture](docs/knowledge-base/01-architecture/)** - Clean Architecture, modules, design patterns
  - [Overview](docs/knowledge-base/01-architecture/overview.md) - Layers and dependency flow
  - [Modules](docs/knowledge-base/01-architecture/modules.md) - 8 модулей системы
  - [Patterns](docs/knowledge-base/01-architecture/patterns.md) - Repository, DI, Factory, Use Case
- **[Data Flow](docs/knowledge-base/07-data-flow/)** - How data moves through the system
  - [Voice → Transaction](docs/knowledge-base/07-data-flow/voice-to-transaction.md) - AI-powered voice processing
  - [API Lifecycle](docs/knowledge-base/07-data-flow/api-lifecycle.md) - HTTP request flow
  - [Budget Calculation](docs/knowledge-base/07-data-flow/budget-calculation.md) - Cross-module calculations
- **[Development Guide](docs/knowledge-base/08-development/)** - Quick start, adding features
  - [Quick Start](docs/knowledge-base/08-development/quick-start.md) - Setup and running
  - [Adding Features](docs/knowledge-base/08-development/adding-features.md) - Use cases, endpoints, modules
  - [Database Guide](docs/knowledge-base/08-development/database-guide.md) - SQLite vs Supabase
  - [Troubleshooting](docs/knowledge-base/08-development/troubleshooting.md) - Common issues
- **[UX Improvements](docs/knowledge-base/09-ux-improvements/)** - UI/UX enhancement tracking
  - [UI/UX Analysis](docs/knowledge-base/09-ux-improvements/ui-ux-analysis.md) - Complete analysis and recommendations
- **[Design Guidelines](docs/knowledge-base/10-design-guidelines/)** - Frontend design rules (MUST FOLLOW)
  - [Design Guidelines](docs/knowledge-base/10-design-guidelines/design-guidelines.md) - Complete design system rules
- **[Backend Standards](docs/BACKEND_STANDARDS.md)** - Backend coding standards (MUST FOLLOW)
  - Error handling, Repository patterns, Use Cases, Controllers, Naming conventions

## Architecture Overview

This project follows **Clean Architecture** principles with clear separation between layers:

### Module System

The application is organized into **8 main modules** created in `src/appModules.ts`:

1. **TransactionModule** - CRUD operations for transactions + analytics
2. **BudgetModule** - Budget management (depends on TransactionModule)
3. **DebtModule** - Debt management with payment history (depends on TransactionModule)
4. **VoiceProcessingModule** - AI-powered voice/text processing (depends on TransactionModule)
5. **OpenAIUsageModule** - OpenAI API usage monitoring
6. **DashboardModule** - Aggregates insights from other modules
7. **SubscriptionModule** - Premium subscriptions with Telegram Stars payments
8. **UserModule** - User management (telegramId → UUID resolution)

### Module Dependencies

```
TransactionModule (core)
    ↑
    ├─── BudgetModule (для расчета spent)
    ├─── DebtModule (для создания linked транзакций)
    ├─── VoiceProcessingModule (CreateTransactionUseCase)
    └─── DashboardModule (analytics aggregation)
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
- Хранит learned patterns в `data/patterns.json`
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

## GitHub-first Workflow (MUST FOLLOW)

**IMPORTANT**: GitHub — единственный центр управления проектом: задачи, планирование, документация, код, wiki.

### GitHub Project Board

- **Project:** "Finance Tracker Development" — https://github.com/users/chollak/projects/1
- **Колонки:** Backlog → In Progress → Review → Done
- **Все задачи должны быть на доске** — перед началом работы перенести issue в "In Progress"
- При создании PR привязывать к issue (`fixes #XX`)

### Milestones

| Milestone | Фокус |
|-----------|-------|
| v1.1 — Core Features | Recurring, Export, Quick-add |
| v1.2 — Analytics & Insights | Analytics v2, UX фиксы, Drawer, Tabs |
| v1.3 — Growth & Monetization | Multi-currency, Savings, Onboarding, Telegram insights |

### GitHub Wiki (MUST FOLLOW)

- **URL:** https://github.com/chollak/finance-tracker-backend/wiki
- **Repo:** клонировать `finance-tracker-backend.wiki.git` в `/tmp/finance-tracker-wiki` для редактирования

**Страницы Wiki:**

| Страница | Содержание | Когда обновлять |
|----------|-----------|-----------------|
| Home | Навигация по wiki | При добавлении новых страниц |
| Architecture Overview | Clean Architecture, слои, data flow | При изменении архитектуры |
| Module System | 8 модулей, зависимости | При добавлении/удалении модуля |
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

**ВАЖНО:** При каждом значимом изменении (новый модуль, endpoint, env var, архитектурное решение) — обновить соответствующую Wiki страницу и сообщить пользователю что обновлено.

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

### Рабочий процесс (MUST FOLLOW)

1. **Перед началом работы:** найти или создать issue, привязать к milestone
2. **Начало работы:** перенести issue в "In Progress" на доске
3. **Разработка:** коммиты ссылаются на issue (`refs #XX`)
4. **Завершение:** PR с `fixes #XX`, привязать к project board
5. **После merge:** обновить Wiki/docs если нужно, записать решение в Product Decisions

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
| Задачи, баги, фичи | GitHub Issues + Project Board |
| Roadmap, план развития | GitHub Milestones + Wiki (Roadmap) |
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
| **Font** | Inter (400/600/700 weights only) |
| **Colors** | Neutral grays + ONE accent color (green for finance) |
| **Border Radius** | Cards: 24px, Buttons/Inputs: 12px, Pills: full |
| **Animations** | Fade-in 300ms, Hover 150ms, Stagger 50ms |
| **Touch Targets** | Minimum 44x44px, prefer 48x48px |
| **Approach** | Mobile-first, then scale up |

### Design Anti-Patterns (AVOID)
- Purple/violet gradients (AI slop aesthetic)
- Multiple accent colors
- Heavy shadows
- Animations longer than 600ms
- Font weights 500 (use 400 or 700)
- Decorative borders on cards

The webapp uses a **custom design system** built with Tailwind CSS and React TypeScript components, implementing a modern, mobile-first finance tracker interface.

### Design System Structure

**Location:** `webapp/src/design-system/`

```
webapp/src/design-system/
├── tokens.ts                    # Design tokens (colors, spacing, typography)
├── components/
│   ├── Button/                  # Button component with variants
│   ├── Card/                    # Card container component
│   ├── Avatar/                  # User avatar component
│   ├── Badge/                   # Status badge component
│   ├── Modal/                   # Modal dialog component
│   └── index.ts                 # Barrel export
```

### Design Tokens

**File:** `webapp/src/design-system/tokens.ts`

Centralized design constants:
- **Colors:** App background, card dark, lime, lavender, income/expense colors
- **Spacing:** Consistent padding/margin values
- **Typography:** Font families, sizes, weights
- **Shadows:** Card shadows, modal shadows
- **Border Radius:** Rounded corners (2xl, 3xl, 4xl, etc.)

### Color Palette

```typescript
'app-bg': '#F5F5F7',        // Light gray background
'card-dark': '#1C1C1E',     // Dark cards/navigation
'lime': '#D4F14D',          // Primary accent (Transfer button)
'lavender': '#D4CFED',      // Secondary accent (Request button)
'green-income': '#00D68F',  // Income amounts
'red-expense': '#FF6B6B',   // Expense amounts
```

### UI Components

**Import pattern:**
```typescript
import { Button, Card, Avatar, Badge, Modal } from './design-system/components';
```

**Button variants:**
- `primary` - Dark background (default actions)
- `secondary` - Light gray background
- `outline` - Bordered button
- `ghost` - Transparent background
- `lime` - Lime accent (transfers)
- `lavender` - Lavender accent (requests)

**Card variants:**
- `white` - White background (default)
- `dark` - Dark background (balance card)
- `gradient` - Lime to lavender gradient

**Example usage:**
```typescript
<Button variant="lime" size="lg" leftIcon="💸">
  Transfer
</Button>

<Card variant="dark" rounded="4xl" padding="lg">
  <h2>Balance Card</h2>
</Card>
```

### Key Features

1. **Dynamic Font Sizing** - BalanceCard automatically scales text based on amount magnitude
2. **Responsive Design** - Mobile-first with breakpoints (md: 768px, lg: 1024px)
3. **Hybrid Navigation** - BottomNav (mobile) + TopNav (desktop)
4. **Consistent Animations** - Fade-in, slide-up, bubble-in, ripple effects
5. **TypeScript Typed** - Full type safety for all components

### Custom Components

**Location:** `webapp/src/components/`

- **BalanceCard** - Dark card showing balance with dynamic font sizing
- **TransactionItem** - Transaction list item with category icon
- **BudgetCard** - Budget progress card with alerts
- **Navigation** - Top navigation (desktop only)
- **BottomNav** - Bottom navigation (mobile only)

### Responsive Breakpoints

```css
/* Mobile-first approach */
default: mobile (< 768px)
md: tablet (≥ 768px)
lg: desktop (≥ 1024px)
```

### Animation Classes

Available in `webapp/src/index.css`:
- `.fade-in` - Fade in with slight upward movement
- `.slide-up` - Slide up from bottom
- `.bubble-in` - Scale up bubble effect
- `.animate-ripple` - Ripple effect for active nav items

### Adding New Components

1. Create folder in `webapp/src/design-system/components/ComponentName/`
2. Create `ComponentName.tsx` with component implementation
3. Create `ComponentName.types.ts` for TypeScript interfaces (optional)
4. Create `index.ts` with barrel export
5. Add export to `webapp/src/design-system/components/index.ts`
6. Use design tokens from `tokens.ts` for consistency

### Styling Guidelines

- Use Tailwind utility classes (configured in `tailwind.config.js`)
- Reference design tokens for colors, spacing, shadows
- Maintain 4xl/5xl border radius for cards (modern, rounded aesthetic)
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

- **Notion**: Primary database using @notionhq/client
- **OpenAI**: Voice transcription using openai package
- **Telegram**: Bot interface using telegraf package
- **Express**: HTTP server with cors and multer for file uploads