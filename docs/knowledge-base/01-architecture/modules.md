# Module System

`createModules()` (`src/appModules.ts`) возвращает **11 модулей приложения**, каждый с чётко определённой ответственностью. `CategoryModule` добавлен в FT-099, `AccountModule` — в FT-101, `FxModule` — в FT-102, `QuickCaptureModule` — обёртка над текстовым разбором для `POST /api/quick-capture`.

Dashboard модулем не является: в `src/modules/dashboard/` лежат только `DashboardService` и `DashboardController`, файла `dashboardModule.ts` нет. Сборка происходит в Express-слое — см. [Dashboard: сервис, а не модуль](#dashboard-сервис-а-не-модуль).

## Module Dependencies

```mermaid
graph TD
    TM[TransactionModule<br/>CRUD + Analytics]
    BM[BudgetModule<br/>Budget Management]
    DeM[DebtModule<br/>Debt Management]
    VM[VoiceProcessingModule<br/>Voice/Text Processing]
    OM[OpenAIUsageModule<br/>Usage Monitoring]
    SM[SubscriptionModule<br/>Premium + Payments]
    UM[UserModule<br/>Users + Settings]
    CM[CategoryModule<br/>User Categories]
    AM[AccountModule<br/>Accounts + Balances]
    FM[FxModule<br/>USD rate]
    QM[QuickCaptureModule<br/>Quick capture API]
    DS[DashboardService<br/>не модуль, собирается в Express]

    BM -->|depends on| TM
    DeM -->|depends on| TM
    DeM -->|depends on| SM
    DeM -->|depends on| UM
    VM -->|depends on| TM
    VM -->|depends on| DeM
    TM -.->|setSubscriptionDependencies| SM
    TM -.->|setCategoryResolver| CM
    TM -.->|setAccountResolver| AM
    AM -.->|default account| UM
    AM -.->|setRateProvider| FM
    FM -.->|own rate in settings| UM
    VM -.->|categories for the prompt| CM
    QM -->|depends on| VM
    SM -.->|controller uses| UM
    DS -.->|AnalyticsService| TM
    DS -.->|BudgetService| BM

    style TM fill:#4CAF50,stroke:#2E7D32,color:#fff
    style BM fill:#2196F3,stroke:#1565C0,color:#fff
    style DeM fill:#FF5722,stroke:#BF360C,color:#fff
    style VM fill:#FF9800,stroke:#E65100,color:#fff
    style OM fill:#9C27B0,stroke:#6A1B9A,color:#fff
    style SM fill:#FFD700,stroke:#B8860B,color:#000
    style UM fill:#00BCD4,stroke:#00838F,color:#fff
    style CM fill:#8BC34A,stroke:#558B2F,color:#fff
    style QM fill:#FFB74D,stroke:#E65100,color:#000
    style DS fill:#ECEFF1,stroke:#90A4AE,color:#000,stroke-dasharray: 4 4
```

## Module Overview

| Модуль | Роль | Зависимости | Ключевые файлы |
|--------|------|-------------|----------------|
| **TransactionModule** | Core: транзакции и аналитика | Независимый при создании; позже получает Subscription + User через `setSubscriptionDependencies()` | `transactionModule.ts` |
| **BudgetModule** | Управление бюджетами | TransactionModule | `budgetModule.ts` |
| **DebtModule** | Управление долгами | TransactionModule, SubscriptionModule, UserModule | `debtModule.ts` |
| **VoiceProcessingModule** | AI обработка голоса/текста | TransactionModule, DebtModule (не используется с Д2), категории пользователя для промпта | `voiceProcessingModule.ts` |
| **QuickCaptureModule** | `POST /api/quick-capture` поверх текстового разбора | VoiceProcessingModule | `quickCaptureModule.ts` |
| **AccountModule** | Счета (FT-101): остатки на чтении, итог в сумах, счёт новой записи | Независимый; TransactionModule получает его как `AccountResolver`; счёт по умолчанию — из настроек UserModule | `accountModule.ts` |
| **FxModule** | Курс доллара (FT-102): ЦБ по датам, свой курс, действующий курс | Свой курс хранится в настройках UserModule; AccountModule получает его как `EffectiveRateProvider` | `fxModule.ts` |
| **CategoryModule** | Категории пользователя (FT-099): 8 + 8 стартовых, переименование, цвет, скрытие; разрешение категории записи | Независимый; TransactionModule получает его как `CategoryResolver` | `categoryModule.ts` |
| **OpenAIUsageModule** | Мониторинг OpenAI costs | Независимый | `openAIUsageModule.ts` |
| **SubscriptionModule** | Premium подписки + Telegram Stars | UserModule (controller) | `subscriptionModule.ts` |
| **UserModule** | Пользователи и их настройки (FT-098) | Независимый | `userModule.ts` |

Отдельно, **не как модуль**:

| Компонент | Роль | Зависимости | Ключевые файлы |
|-----------|------|-------------|----------------|
| `DashboardService` / `DashboardController` | Агрегация insights для dashboard-эндпоинтов | AnalyticsService (Transaction) + BudgetService (Budget) | `src/modules/dashboard/application/services/dashboardService.ts`, `src/modules/dashboard/presentation/controllers/dashboardController.ts` |

---

## 1. TransactionModule

**Файл:** [`src/modules/transaction/transactionModule.ts`](../../../src/modules/transaction/transactionModule.ts)

### Назначение
Core module системы — управление финансовыми транзакциями и аналитикой.

### Use Cases
- `CreateTransactionUseCase` - создание транзакции
- `GetTransactionsUseCase` - получение всех транзакций
- `GetUserTransactionsUseCase` - транзакции пользователя
- `UpdateTransactionUseCase` - обновление транзакции
- `DeleteTransactionUseCase` - удаление транзакции
- `UpdateTransactionWithLearningUseCase` - обновление с ML записью

### Services
- `AnalyticsService` - аналитика (summary, categories, trends, patterns)

### Repository
- Interface: `src/modules/transaction/domain/transactionRepository.ts`
- Implementation: `SqliteTransactionRepository` (TypeORM)

### Module Creation
```typescript
const transactionModule = TransactionModule.create();
// Внутри: RepositoryFactory.createTransactionRepository()
```

---

## 2. BudgetModule

**Файл:** [`src/modules/budget/budgetModule.ts`](../../../src/modules/budget/budgetModule.ts)

### Назначение
Управление бюджетами с автоматическим расчетом потраченной суммы.

### Use Cases
- `CreateBudgetUseCase` - создание бюджета
- `GetBudgetsUseCase` - получение бюджетов пользователя
- `UpdateBudgetUseCase` - обновление бюджета
- `DeleteBudgetUseCase` - удаление бюджета

### Services
- `BudgetService` - расчет spent, budget summaries, alerts

### Key Dependency
```typescript
new BudgetService(
  budgetRepository,
  transactionModule.getRepository() // Нужен для расчета spent
)
```

**Почему зависимость?**
Для расчета `spent` нужно суммировать транзакции пользователя в периоде бюджета через `transactionRepository.getByUserIdAndDateRange()`.

---

## 3. DebtModule

**Файл:** [`src/modules/debt/debtModule.ts`](../../../src/modules/debt/debtModule.ts)

### Назначение
Управление долгами (кто кому должен) с историей погашений.

### Use Cases
- `CreateDebtUseCase` - создание долга (+ опциональная транзакция)
- `GetDebtsUseCase` - получение долгов пользователя, summary
- `UpdateDebtUseCase` - обновление и отмена долга
- `DeleteDebtUseCase` - удаление долга
- `PayDebtUseCase` - частичное/полное погашение долга

### Entities
- `Debt` - долг с типом (i_owe / owed_to_me), суммой, статусом
- `DebtPayment` - запись о платеже по долгу

### Key Dependency
```typescript
new CreateDebtUseCase(
  debtRepository,
  transactionModule.getCreateTransactionUseCase() // Для создания linked транзакции
)
```

**Почему зависимость?**
При создании долга с флагом `moneyTransferred=true` создается связанная транзакция (income/expense) для отражения реального движения денег.

### Hybrid Approach
- Долги как отдельная сущность (не транзакции)
- При передаче денег создается linked транзакция
- Баланс отражает реальность
- Долги не загрязняют бюджетную аналитику

---

## 4. SubscriptionModule

**Файл:** [`src/modules/subscription/subscriptionModule.ts`](../../../src/modules/subscription/subscriptionModule.ts)

### Назначение
Freemium модель с Telegram Stars: лимиты для free tier, безлимит для premium.

### Tier System

| Tier | Транзакции | Голосовые | Долги | Аналитика |
|------|------------|-----------|-------|-----------|
| **Free** | 50/месяц | 10/месяц | 5 активных | Скрыта |
| **Premium** | ∞ | ∞ | ∞ | Полная |

### Subscription Sources
- `payment` - оплата через Telegram Stars (100 Stars/месяц)
- `trial` - 14-дневный пробный период
- `gift` - подарок от админа (на определенный период)
- `lifetime` - пожизненный доступ

### Use Cases
- `CreateSubscriptionUseCase` - создание подписки после оплаты
- `GetSubscriptionUseCase` - получение статуса подписки с лимитами
- `CheckLimitUseCase` - проверка лимита перед действием
- `IncrementUsageUseCase` - увеличение счетчика после действия
- `GrantPremiumUseCase` - выдача premium админом
- `StartTrialUseCase` - запуск trial для нового пользователя
- `CancelSubscriptionUseCase` - отмена подписки

### Services
- `SubscriptionService` - проверка premium статуса, обработка истекших подписок

### Entities
- `Subscription` - подписка с tier, source, status, payment info
- `UsageLimit` - счетчики использования для free tier

### Repository
- Interface: `subscriptionRepository.ts`, `usageLimitRepository.ts`
- Implementations: TypeORM (SQLite)

### Key Dependency (Controller Layer)
```typescript
// SubscriptionController получает UserModule для резолва telegram_id → UUID
new SubscriptionController(subscriptionModule, userModule)
```

**Почему зависимость?**
API принимает telegram_id (например, `131184740`), но БД использует UUID. Controller резолвит ID через `GetOrCreateUserUseCase`.

### User ID Resolution

Controller обрабатывает 3 типа user ID:

| ID Type | Пример | Обработка |
|---------|--------|-----------|
| **Guest** | `guest_abc123-...` | Default free tier (без обращения к БД) |
| **Telegram ID** | `131184740` | Резолв через UserModule → UUID |
| **UUID** | `6c7c7a0e-...` | Прямой запрос к БД |

```typescript
// В SubscriptionController
if (this.isGuestUser(userId)) {
  return this.createGuestUserResponse(userId); // Free tier по умолчанию
}
const userUUID = await this.resolveUserId(userId); // telegram_id → UUID
```

### Telegram Stars Integration
```typescript
// Отправка invoice
await telegram.sendInvoice(chatId, {
  title: 'Premium',
  payload: JSON.stringify({ userId, type: 'premium' }),
  provider_token: '', // ПУСТАЯ СТРОКА для Stars!
  currency: 'XTR',
  prices: [{ label: 'Premium', amount: 100 }],
});

// КРИТИЧНО: ответить в течение 10 сек!
bot.on('pre_checkout_query', async (ctx) => {
  await ctx.answerPreCheckoutQuery(true);
});
```

### Middleware
- Express: `checkLimit`, `incrementUsage`, `requirePremium`
- Telegram: `createTelegramCheckLimitMiddleware`, `createTelegramIncrementUsageMiddleware`

---

## 5. VoiceProcessingModule

**Файл:** [`src/modules/voiceProcessing/voiceProcessingModule.ts`](../../../src/modules/voiceProcessing/voiceProcessingModule.ts)

### Назначение
AI-powered обработка голосовых сообщений и текстового ввода в транзакции.

### Use Cases
- `ProcessVoiceInputUseCase` - OGG → MP3 → Whisper → GPT → Transaction
- `ProcessTextInputUseCase` - Text → GPT → Transaction

### Services
- `OpenAITranscriptionService` - Whisper transcription + GPT parsing

### Key Dependency
```typescript
new ProcessVoiceInputUseCase(
  transcriptionService,
  transactionModule.getCreateTransactionUseCase() // Создание транзакции
)
```

**Почему зависимость?**
После парсинга транзакции из голоса/текста, нужно сохранить её через `CreateTransactionUseCase`.

---

## 6. OpenAIUsageModule

**Файл:** [`src/modules/openai-usage/openAIUsageModule.ts`](../../../src/modules/openai-usage/openAIUsageModule.ts)

### Назначение
Мониторинг использования и стоимости OpenAI API.

### Use Cases
- `GetOpenAIUsageUseCase` - получение usage data, billing limits, credit balance

### Repository
- `OpenAIUsageRepositoryImpl` - прямые API calls к OpenAI

### Features
- In-memory кеширование (5 минут)
- Расчет процента использования лимитов
- Алерты при приближении к лимиту

---

## 7. UserModule

**Файл:** [`src/modules/user/userModule.ts`](../../../src/modules/user/userModule.ts)

### Назначение
Управление пользователями и резолв внешних идентификаторов (`telegramId` → внутренний UUID).

### Использование
`SubscriptionController` и роутеры транзакций/бюджетов/долгов используют модуль, чтобы принять `telegram_id` во внешнем API и работать с UUID внутри. Маршруты вехи 10 берут пользователя только из авторизации через `createCurrentUserMiddleware(userModule)`.

### Настройки (FT-098)
`GetUserSettingsUseCase`, `UpdateUserSettingsUseCase` и таблица `user_settings`; маршрут `GET/PATCH /api/settings`. Контракт — [`docs/pastel/api.md`](../../pastel/api.md).

---

## 8. CategoryModule

**Файл:** [`src/modules/category/categoryModule.ts`](../../../src/modules/category/categoryModule.ts)

### Назначение
Категории пользователя (FT-099, решение Д5). У каждого 8 расходных и 8 доходных стартовых категорий из дизайна; их можно переименовать, перекрасить в один из 8 пастельных цветов, скрыть («Другое» не скрывается) и добавить свои. Запись хранит `category_id`.

### Состав
- `CategoryCatalog` — создаёт стартовый набор при первом обращении, реализует порт `CategoryResolver` модуля транзакций и `UserCategorySource` модуля разбора.
- `categoryPresets.ts` — стартовые категории и перевод старых 26 + 7 id, названий и синонимов в новые с учётом типа записи.
- `ListCategoriesUseCase`, `CreateCategoryUseCase`, `UpdateCategoryUseCase` — `GET/POST /api/categories`, `PATCH /api/categories/:id`.

### Как запись получает категорию
`CreateTransactionUseCase` и обновление спрашивают `CategoryResolver`: id категории (новые клиенты) → своё название без учёта регистра → старый id, название или синоним через стартовую категорию → «Другое» того же типа. Автоматические пути (ИИ, быстрый разбор текста) не кладут запись в скрытую категорию. Смена типа без новой категории переносит запись в одноимённую категорию другого типа или в его «Другое».

---

## 9. AccountModule

**Файл:** [`src/modules/account/accountModule.ts`](../../../src/modules/account/accountModule.ts)

### Назначение
Счета пользователя (FT-101): наличные, карта, доллары. Счёт скрывают, а не удаляют. Пользователю без счетов создаётся «Карта» (UZS); при миграции на неё переехала вся история.

### Состав
- `AccountBook` — создаёт «Карту» при первом обращении, считает остатки (`summary`) и итог видимых счетов в сумах (доллары — через порт `EffectiveRateProvider`, FT-102), реализует порт `AccountResolver` модуля транзакций: выбранный счёт → счёт по умолчанию из настроек → первый видимый. Скрытый счёт для новой записи не выбирается.
- `SqliteAccountRepository.balanceChanges` — остаток считается на чтении одним запросом, без кэша.
- `ListAccountsUseCase`, `CreateAccountUseCase`, `UpdateAccountUseCase` — `GET/POST /api/accounts`, `PATCH /api/accounts/:id`.

---

## 10. FxModule

**Файл:** [`src/modules/fx/fxModule.ts`](../../../src/modules/fx/fxModule.ts)

### Назначение
Курс доллара (FT-102). Курс ЦБ Узбекистана хранится по датам в `fx_rates`, загружается при старте и раз в час, пока нет курса на сегодня; без ответа действует последний известный. Свой курс пользователя — в `user_settings` (`fx_own_rate_minor`, `fx_own_since`) — действует вместо курса ЦБ.

### Состав
- `FxRateService` — `refreshUsd`, `cbuRateOn(date)` (для обменов FT-104), `effectiveUsdRate(userId)` (порт `EffectiveRateProvider` модуля счетов), `setOwnRate`.
- `HttpCbuClient` — запрос к ЦБ с таймаутом 10 с; любая ошибка — «нет ответа», без падения.
- `GET /api/rates/usd`, `PUT` и `DELETE /api/rates/usd/own`.

---

## Dashboard: сервис, а не модуль

**Файлы:**
- [`src/modules/dashboard/application/services/dashboardService.ts`](../../../src/modules/dashboard/application/services/dashboardService.ts)
- [`src/modules/dashboard/presentation/controllers/dashboardController.ts`](../../../src/modules/dashboard/presentation/controllers/dashboardController.ts)
- [`src/delivery/web/express/routes/dashboardRoutes.ts`](../../../src/delivery/web/express/routes/dashboardRoutes.ts)

### Назначение
Агрегация данных из множества источников для dashboard view.

### Services
- `DashboardService` - полная dashboard сводка
  - Financial summary (из AnalyticsService)
  - Budget overview (из BudgetService)
  - Insights (savings rate, trends, рекомендации)
  - Financial Health Score (0-100)

### Где собирается

Файла `dashboardModule.ts` **нет**, и `createModules()` не возвращает `dashboardModule`. Сервис и контроллер создаются в Express-слое, внутри `createDashboardRouter()`:

```typescript
// src/delivery/web/express/routes/dashboardRoutes.ts
const dashboardService = new DashboardService(analyticsService, budgetService);
const alertService = new AlertService(budgetService, analyticsService);
const controller = new DashboardController(dashboardService, alertService);
```

А `expressServer.ts` передаёт туда зависимости уже из готовых модулей:

```typescript
router.use(
  '/dashboard',
  createDashboardRouter(
    transactionModule.getAnalyticsService(),
    budgetModule.budgetService,
    subscriptionModule,
    userModule
  )
);
```

**Особенность:** нет собственных use cases и нет модуля — только service для агрегации, поднимаемый delivery-слоем.

---

## Module Creation в appModules.ts

**Файл:** [`src/appModules.ts`](../../../src/appModules.ts)

```typescript
export function createModules() {
  // 1. Core модули без зависимости от subscription
  const categoryModule = CategoryModule.create();
  const transactionModule = TransactionModule.create();
  transactionModule.setCategoryResolver(categoryModule.getCatalog()); // FT-099
  const budgetModule = BudgetModule.create(transactionModule);
  const userModule = UserModule.create();
  const openAIUsageModule = createOpenAIUsageModule();

  // 2. SubscriptionModule с repositories
  const subscriptionModule = new SubscriptionModule(subscriptionRepository, usageLimitRepository, {
    freeLimitsEnabled: AppConfig.FREE_LIMITS_ENABLED,
  });

  // 3. Обратная связь: транзакциям нужен subscription для декремента при удалении
  transactionModule.setSubscriptionDependencies(subscriptionModule, userModule);

  // 4. Модули, которым нужны subscription/limits и категории
  const debtModule = DebtModule.create(transactionModule, subscriptionModule, userModule);
  const voiceModule = new VoiceProcessingModule(openAIService, transactionModule, debtModule, categoryModule.getCatalog());
  const quickCaptureModule = QuickCaptureModule.create(voiceModule);

  return { categoryModule, transactionModule, budgetModule, debtModule, voiceModule, quickCaptureModule,
    openAIUsageModule, userModule, subscriptionModule };
}
```

**Порядок важен:**
1. Сначала создаются модули без зависимости от subscription; категории подключаются к транзакциям сразу
2. Затем `SubscriptionModule`, после чего `transactionModule.setSubscriptionDependencies()` замыкает обратную связь
3. Затем модули, которым нужны лимиты (`DebtModule`) и уже готовые модули (`VoiceProcessingModule`)

---

## Dependency Injection Pattern

### Constructor Injection

Каждый модуль получает зависимости через конструктор:

```typescript
class BudgetModule {
  constructor(private transactionModule: TransactionModule) {
    this.repository = RepositoryFactory.createBudgetRepository();
    this.budgetService = new BudgetService(
      this.repository,
      transactionModule.getRepository()
    );
  }
}
```

### Benefits
✅ **Explicit Dependencies** - видно, от чего зависит модуль
✅ **Testability** - легко мокировать зависимости в тестах
✅ **Flexibility** - можно передать любую реализацию
✅ **Compile-time Safety** - TypeScript проверяет типы

---

## Module Interface Pattern

Каждый модуль предоставляет getter-методы для доступа к use cases:

```typescript
class TransactionModule {
  getCreateTransactionUseCase() { return this.createTransactionUseCase; }
  getAnalyticsService() { return this.analyticsService; }
  getRepository() { return this.repository; }
}
```

**Почему не публичные свойства?**
- Инкапсуляция внутренней структуры
- Возможность добавить логику (например, lazy initialization)
- Явный API модуля

---

## Repository Factory

**Файл:** [`src/shared/infrastructure/database/repositoryFactory.ts`](../../../src/shared/infrastructure/database/repositoryFactory.ts)

```typescript
// Один путь к базе — TypeORM (FT-090); фабрика остаётся единственным местом создания репозиториев
class RepositoryFactory {
  static createTransactionRepository(): TransactionRepository {
    return new SqliteTransactionRepository();
  }

  static createBudgetRepository(): BudgetRepository {
    return new SqliteBudgetRepository();
  }
}
```

**Преимущества:**
- Централизованный выбор реализации
- Легко добавить новую БД (например, MongoDB)
- Модули не зависят от конкретной БД

---

## См. также

- [Overview](overview.md) - Clean Architecture layers
- [Patterns](patterns.md) - Design patterns в проекте
- [Development Guide](../08-development/adding-features.md) - Как добавить новый модуль
