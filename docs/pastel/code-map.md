# Карта кода перед переносом «Пастели»

Снимок на коммите `64e2726` (7 сентября 2026). Цель — чтобы любой агент или человек за 10 минут понял, что
в проекте есть, что работает и на что опирается перенос. Подробности по API — в коде контроллеров, здесь
только то, что важно для решения.

## Backend — `src/`

Node + TypeScript, Express (REST под `/api`) и Telegraf (бот, long polling) в одном процессе. Clean
Architecture: `domain → application → infrastructure → presentation` внутри каждого модуля.

| Модуль | Что делает | Судьба при переносе |
|---|---|---|
| `transaction` | CRUD, архив, аналитика (summary, categories, trends, patterns), обучение на исправлениях | Ядро. Расширяется: счёт, валюта, суммы в целых, категория по id, мягкое удаление |
| `voiceProcessing` | Whisper → GPT-разбор, быстрые пути без ИИ, несколько записей за раз, долги из текста | Остаётся. Учится счёту («нал», «карта», «$») и категориям пользователя |
| `quickCapture` | Единая обёртка ввода для бота, mini app и iOS Shortcut, текст подтверждения | Остаётся, контракт для Shortcut не ломаем |
| `user` | telegramId → UUID, `default_currency`, `timezone` (не используется) | Остаётся + настройки пользователя |
| `subscription` | Telegram Stars, пробный период, лимиты free (50 записей и 10 голосовых в месяц, 5 долгов) | Остаётся в коде. Лимиты — решение Шукура (см. README) |
| `budget` | Бюджеты по категориям и периодам, пересчёт `spent` | Из интерфейса уходит. Цели ревизии — отдельная сущность |
| `debt` | Долги, частичные платежи, связанная запись | Из интерфейса уходит, код остаётся; разбор долгов в ИИ выключается |
| `openai-usage` | Расход OpenAI по организации | Без изменений |
| `dashboard` (не модуль) | Инсайты, health score, алерты | Заменяется аналитикой и ревизией «Пастели», удаляется в уборке |

**Бот** (`src/delivery/messaging/telegram/`): `/start`, `/today`, `/stats`, `/budget`, `/week`, `/weekly`,
`/transactions`, `/help`, `/premium`, `/cancel_subscription`. Текст и голос идут через `QuickCaptureService`, каждое подтверждение — отдельным сообщением с
кнопками «Изменить» (открывает mini app) и «Удалить». Только русский. Планировщика нет: ни сводок, ни
напоминаний. Payload у `/start` не читается.

**Данные.** TypeORM + SQLite (`data/database.sqlite`, `synchronize` в dev). Параллельно живёт путь Supabase
через `supabase-js` со своими репозиториями и ручными SQL-миграциями в `migrations/` (проект на паузе).
Сущности: `transactions`, `budgets`, `debts`, `debt_payments`, `users`, `subscriptions`, `usage_limits`.

`transactions`: `amount decimal(10,2)`, `type`, `semanticType` (8 значений), `needsReview`, `description`,
`date` (без времени), `merchant`, `confidence`, `originalText`, `originalParsing`, `category` (строка, по
умолчанию `'Другое'`), `isArchived`, `isDebtRelated`, `relatedDebtId`, `splitGroupId`, `userId`.

**Деньги.** Только сумы. Сумма — JS `number` с плавающей точкой и округлением `Math.round(x*100)/100`.
`decimal(10,2)` в Postgres вмещает до 99 999 999,99 — меньше одной зарплаты в сумах за год. Счетов, валюты
у записи, курсов и переводов нет. «$50» сохраняется как 50 сум.

**Категории.** Один источник — `src/shared/domain/entities/Category.ts`: 26 расходных и 7 доходных id с эмодзи
и синонимами, плюс `transfer` и `debt`. Таблицы категорий нет, в записи хранится строка. Копия списка —
`webapp/src/entities/category/model/categories.ts`.

**ИИ.** `gpt-4-turbo` (JSON-ответ) и `whisper-1`; промпты в `src/shared/domain/constants/messages.ts`.
Уверенность ниже 0,6 — кнопки подтверждения в боте; `needsReview` исключает запись из итогов. Обучение
глобальное, в `data/patterns.json`. Фото и QR чеков нет.

**Проверки.** 34 файла Jest, около 410 тестов (`npm test`); `npm run verify` — сборки, Jest, Vitest
webapp, проверка архитектуры и шрифтов.

### Баги, которые мешают переносу

Найдены при составлении карты. Все подтверждены чтением кода.

| Где | Что | Чем мешает |
|---|---|---|
| `SqliteTransactionRepository.update()` | нет ветки для `category` — смена категории молча теряется на SQLite | Карточка операции и проверка записей правят категорию |
| `callbackHandlers.ts`, «Удалить» в боте | `DeleteTransactionUseCase.execute(transactionId)` вызывается строкой вместо `{ id }`; проверка «последней записи» сравнивает разные ключи | В «Пастели» отмена и «Вернуть» — одно нажатие |
| `CreateTransactionUseCase` + обработчики бота + middleware `POST /transactions` | счётчик записей free-лимита увеличивается дважды | Лимит наступает вдвое раньше |
| `requireAdmin` на `transactionController.ts:97, 254` и в `openAIUsageRoutes.ts` | перед ним нет авторизации — всегда 401 (на `/subscription/grant` авторизация есть) | Не мешает. Мёртвый `GET /api/transactions` убран в FT-107: путь занят историей |
| Репозитории транзакций | `isDebtRelated`, `relatedDebtId`, `tags`, `splitGroupId` не сохраняются | Не мешает, если долги уходят из интерфейса |

## Webapp — `webapp/src/`

React 19, Vite, Tailwind 4 (`@theme inline` в `app/styles/globals.css`), shadcn/Radix, React Query, zustand,
Dexie, react-router 7, sonner, motion (recharts убран в FT-121). Feature-Sliced Design: `app`, `pages` (12), `widgets` (11),
`features` (12), `entities` (7), `shared`. Около 258 файлов, 20 файлов тестов Vitest (только чистые функции).

**Маршруты.** `/` Главная, `/transactions` История (FT-116: поиск и фильтры), `/add` ручной ввод (FT-113; `/transactions/add`
убран), `/review` проверка записей фразы (FT-114), `/?record=<id>` — главная с карточкой операции (FT-115;
`/transactions/:id/edit` убран), `/accounts` счета с итогом и курсом и `/accounts/:id` экран счёта (FT-118; его запись открывает
`/transactions?account=<id>&record=<id>` — историю, суженную до счёта, с карточкой операции), `/accounts/transfer[?from=<id>]`
перевод и обмен (FT-119), `/analytics[?month=YYYY-MM&type=income]` аналитика месяца и
`/analytics/categories/:id[?month=]` категория по дням (FT-121; старые `FinancialHealth`, круговая диаграмма и вызовы
`dashboard` из webapp удалены),
`/budgets…`, `/debts…`, `/more`.
Нижний бар (FT-086): Главная · История · Записать · Ещё.
`BackButton`/`MainButton` Telegram написаны, но не используются.

**Что переиспользуется при переносе**

- `shared/api/client.ts` — клиент с `Authorization: tma <initData>`.
- `entities/*/api` — запросы и мутации React Query, ключи кэша, `toViewModel`.
- `features/quick-capture` — отправка текста, разбор ответа (`toCaptureFeedback`); с FT-114 там же `Composer`,
  чипы частых трат и экран проверки записей `/review`.
- `entities/transaction/lib` — группировка по дням, подписи строк.
- `shared/lib/formatters`, `plural.ts`, `haptic.ts`, `captureFocus.ts`.
- `useUserStore` (zustand), `shared/hooks/useTelegram.ts`.

**Что заменяется целиком.** Токены и шрифт (Onest, нейтральный shadcn, только светлая тема), нижний бар,
страницы и виджеты Главной, Истории, Аналитики, «Ещё», формы ввода и правки.

**Чего в webapp нет вообще.** Тёмной темы, голоса (только в боте), счетов и валют, шторок-выборщиков, отмены
действий, офлайн-очереди (Dexie хранит только записи гостя), входа в браузере кроме гостевого режима,
настроек, управления категориями, выгрузки.
