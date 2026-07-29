# Finance Tracker WebApp v2

Современный frontend для Finance Tracker с чистой архитектурой и универсальным дизайном.

## Особенности

- ✅ **FSD архитектура** - Feature-Sliced Design для масштабируемости
- ✅ **View Model Pattern** - Чистая верстка без логики
- ✅ **Навигация без navbar** - FAB кнопки + контекстная навигация
- ✅ **Универсальный дизайн** - Desktop, Mobile, Telegram WebApp
- ✅ **shadcn/ui компоненты** - Современные UI компоненты
- ✅ **Типобезопасность** - Full TypeScript coverage
- ✅ **Code Splitting** - Оптимизированная загрузка

## Tech Stack

```
React 18.3+           - UI библиотека
TypeScript 5.2+       - Типизация
Vite 5+               - Сборщик
shadcn/ui             - UI компоненты
Zustand               - State management (UI state)
TanStack Query        - Server state management
React Router 6        - Роутинг
Tailwind CSS          - Стили
Zod                   - Валидация форм
date-fns              - Работа с датами
recharts              - Графики
```

## Быстрый старт

### Установка зависимостей

```bash
npm install
```

### Разработка

```bash
# Полный стек (рекомендуется)
npm run dev:full

# Только frontend (требует запущенный backend на :3000)
npm run dev
```

Frontend будет доступен на http://localhost:5174

### Production build

```bash
npm run build
```

Build создается в `../public/webapp-v2/`

## Структура проекта

```
webapp-v2/
└── src/
    ├── app/                      # Инициализация приложения
    │   ├── providers/            # QueryProvider, RouterProvider, UserInitializer
    │   ├── router/               # Конфигурация роутов
    │   └── styles/               # Глобальные стили
    │
    ├── pages/                    # Страницы роутов
    │   ├── home/                 # Dashboard
    │   ├── transactions/         # Список транзакций
    │   ├── add-transaction/      # Добавить транзакцию
    │   ├── edit-transaction/     # Редактировать транзакцию
    │   ├── budgets/              # Список бюджетов
    │   ├── add-budget/           # Добавить бюджет
    │   ├── edit-budget/          # Редактировать бюджет
    │   └── analytics/            # Аналитика
    │
    ├── widgets/                  # Сложные UI блоки
    │   ├── balance-card/         # Карточка баланса
    │   ├── budget-overview/      # Обзор бюджетов
    │   ├── recent-transactions/  # Последние транзакции
    │   ├── financial-health/     # Финансовое здоровье
    │   ├── alerts-panel/         # Панель уведомлений
    │   ├── spending-chart/       # График расходов
    │   └── quick-stats/          # Быстрая статистика
    │
    ├── features/                 # Бизнес-фичи
    │   ├── add-transaction/      # Форма добавления
    │   ├── edit-transaction/     # Форма редактирования
    │   ├── delete-transaction/   # Подтверждение удаления
    │   ├── create-budget/        # Форма создания бюджета
    │   ├── edit-budget/          # Форма редактирования бюджета
    │   ├── voice-input/          # Голосовой ввод
    │   ├── text-input/           # Текстовый ввод с AI
    │   └── filter-transactions/  # Фильтрация
    │
    ├── entities/                 # Бизнес-сущности
    │   ├── transaction/          # Transaction + ViewModel
    │   ├── budget/               # Budget + ViewModel
    │   ├── category/             # Категории
    │   ├── alert/                # Уведомления
    │   ├── dashboard/            # Dashboard insights
    │   └── user/                 # User state (Zustand)
    │
    └── shared/                   # Shared ресурсы
        ├── types/                # TypeScript types
        ├── ui/                   # shadcn/ui компоненты
        ├── api/                  # API client
        ├── lib/                  # Утилиты, форматтеры
        ├── config/               # Конфигурация
        └── hooks/                # Хуки
```

## Архитектурные решения

### View Model Pattern

UI компоненты получают готовые отформатированные данные с префиксом `_`:

```typescript
interface TransactionViewModel extends Transaction {
  _formattedAmount: string;      // "-$500" или "+$2,000"
  _formattedDate: string;        // "Today" или "Mar 15"
  _categoryIcon: string;         // "🍔"
  _categoryColor: string;        // semantic token class, e.g. "bg-warning-muted"
  _amountColor: string;          // semantic token class, e.g. "text-expense" or "text-income"
}

// UI просто рендерит готовые значения
function TransactionCard({ transaction }: { transaction: TransactionViewModel }) {
  return (
    <Card>
      <span>{transaction._categoryIcon}</span>
      <p>{transaction._formattedDate}</p>
      <span className={transaction._amountColor}>
        {transaction._formattedAmount}
      </span>
    </Card>
  );
}
```

### Страницы вместо модалок

Формы создания/редактирования - **отдельные страницы**, не модальные окна:

- ✅ `/transactions/add` - добавить транзакцию
- ✅ `/transactions/:id/edit` - редактировать транзакцию
- ✅ `/budgets/add` - создать бюджет
- ✅ `/budgets/:id/edit` - редактировать бюджет

Модалки только для:
- Подтверждение удаления
- Alerts

### Навигация

Без классического navbar/sidebar:

1. **FAB (Floating Action Button)** - главное действие на странице
2. **Back Button** - возврат назад
3. **Inline Links** - переходы внутри контента
4. **Telegram MainButton/BackButton** - для WebApp

### State Management

**Zustand** - UI state:
- User state (userId, userName)
- Transaction filters
- Voice input state

**TanStack Query** - Server state:
- Transactions, budgets, dashboard, analytics
- Автоматическая cache invalidation
- Optimistic updates

## API Integration

Backend на `http://localhost:3000/api`

### Основные endpoints

**Transactions:**
- `GET /api/transactions/user/:userId`
- `POST /api/transactions`
- `PUT /api/transactions/:id`
- `DELETE /api/transactions/:id`

**Budgets:**
- `GET /api/budgets/users/:userId/budgets`
- `POST /api/budgets/users/:userId/budgets`
- `PUT /api/budgets/:budgetId`
- `DELETE /api/budgets/:budgetId`
- `GET /api/budgets/users/:userId/budgets/summaries`
- `GET /api/budgets/users/:userId/budgets/alerts`

**Dashboard:**
- `GET /api/dashboard/:userId`
- `GET /api/dashboard/:userId/quick-stats`

**Voice:**
- `POST /api/voice/text-input`
- `POST /api/voice/voice-input`

## Telegram WebApp

Приложение автоматически определяет запуск в Telegram:

```typescript
const { isTelegram, userId, userName, mainButton, backButton } = useTelegram();

// Использование MainButton
useEffect(() => {
  if (isTelegram && mainButton) {
    mainButton.setText('Добавить транзакцию');
    mainButton.onClick(() => navigate('/transactions/add'));
    mainButton.show();
  }
}, [isTelegram, mainButton]);
```

## Development режим

В dev режиме автоматически используется mock user:

```typescript
userId: 'dev-user-123'
userName: 'Dev User'
```

## Build оптимизация

### Code Splitting

Vendor chunks для оптимальной загрузки:

- `react-vendor` - React, ReactDOM, React Router (33KB gzipped)
- `query-vendor` - TanStack Query (11KB gzipped)
- `charts-vendor` - Recharts (108KB gzipped)
- `form-vendor` - React Hook Form, Zod (27KB gzipped)
- `ui-vendor` - Lucide icons, date-fns (9KB gzipped)

### Lazy Loading

Все страницы загружаются по требованию:

```typescript
const HomePage = lazy(() => import('@/pages').then(m => ({ default: m.HomePage })));
```

## Environment Variables

Создайте `.env` файл в корне проекта:

```env
VITE_API_URL=http://localhost:3000/api
```

## Добавление новых фич

### 1. Создать Entity (если нужна новая сущность)

```
entities/my-entity/
├── model/
│   └── types.ts          # Types + ViewModel interface
├── api/
│   ├── keys.ts           # Query key factory
│   └── queries.ts        # useMyEntity(), useMyEntities()
├── lib/
│   └── toViewModel.ts    # Entity → ViewModel преобразование
├── ui/
│   └── MyEntityCard.tsx  # UI компонент
└── index.ts
```

### 2. Создать Feature (пользовательское взаимодействие)

```
features/my-feature/
├── model/
│   ├── store.ts          # Zustand state (опционально)
│   └── schema.ts         # Zod validation schema
├── api/
│   └── mutations.ts      # useMyMutation()
├── ui/
│   └── MyForm.tsx        # UI компонент
└── index.tsx
```

### 3. Создать Widget (композиция features/entities)

```
widgets/my-widget/
├── ui/
│   └── MyWidget.tsx      # Композиция entities/features
└── index.tsx
```

### 4. Создать Page (композиция widgets)

```
pages/my-page/
├── ui/
│   └── MyPage.tsx        # Композиция widgets
└── index.tsx
```

### 5. Добавить Route

В `src/app/router/routes.tsx`:

```typescript
const MyPage = lazy(() => import('@/pages').then(m => ({ default: m.MyPage })));

// ...

{
  path: '/my-route',
  element: <PageLoader><MyPage /></PageLoader>,
}
```

## Troubleshooting

### Build errors

```bash
# Очистить node_modules и переустановить
rm -rf node_modules package-lock.json
npm install
```

### Type errors

```bash
# Проверить типы без build
npx tsc --noEmit
```

### API недоступен

Убедитесь что backend запущен на `http://localhost:3000`:

```bash
# В корне проекта
npm run dev
```

## Следующие шаги

- [ ] Responsive тестирование (mobile/tablet/desktop)
- [ ] Accessibility improvements (keyboard nav, ARIA)
- [ ] Performance оптимизация
- [ ] E2E тесты
- [ ] PWA support

## Лицензия

MIT
