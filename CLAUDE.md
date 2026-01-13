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

**Legacy Notion support (deprecated):**
- `NOTION_API_KEY` - For database operations
- `NOTION_DATABASE_ID` - Target Notion database ID

The application validates these on startup and will exit with descriptive errors if required variables are missing.

## Documentation

For detailed documentation, see **[docs/knowledge-base/](docs/knowledge-base/)**:

- **[Architecture](docs/knowledge-base/01-architecture/)** - Clean Architecture, modules, design patterns
  - [Overview](docs/knowledge-base/01-architecture/overview.md) - Layers and dependency flow
  - [Modules](docs/knowledge-base/01-architecture/modules.md) - 5 модулей системы
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

## Architecture Overview

This project follows **Clean Architecture** principles with clear separation between layers:

### Module System

The application is organized into **5 main modules** created in `src/appModules.ts`:

1. **TransactionModule** - CRUD operations for transactions + analytics
2. **BudgetModule** - Budget management (depends on TransactionModule)
3. **VoiceProcessingModule** - AI-powered voice/text processing (depends on TransactionModule)
4. **OpenAIUsageModule** - OpenAI API usage monitoring
5. **DashboardModule** - Aggregates insights from other modules

### Module Dependencies

```
TransactionModule (core)
    ↑
    ├─── BudgetModule (для расчета spent)
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

## Design System (WebApp Frontend)

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