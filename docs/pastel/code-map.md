# Карта кода

Что есть в проекте и где это лежит — чтобы агент или человек за 10 минут понял, на что опираться. Сверено с кодом
`main` 2026-11-16 (#292). Контракты API — в [`api.md`](api.md), модель денег — в [`money-model.md`](money-model.md),
модули подробнее — в `CLAUDE.md` («Module System»). Первая версия — снимок перед переносом «Пастели» на коммите
`64e2726` (7 сентября 2026) с найденными тогда багами: `git show df7710fa:docs/pastel/code-map.md`.

## Backend — `src/`

Node + TypeScript в одном процессе: Express (REST под `/api`) и Telegraf (бот, long polling; с
`ENABLE_TELEGRAM_POLLING=false` бот не опрашивает Telegram). Clean Architecture: `domain → application → infrastructure →
presentation` внутри каждого модуля `src/modules/`; правила слоёв и циклы проверяет dependency-cruiser (`npm run analyze`).

| Модуль | Что делает |
|---|---|
| `transaction` | Записи: создание, история с поиском и фильтрами (FT-107), правка, мягкое удаление и возврат (FT-105), итоги периода (FT-103, FT-111), частые траты (FT-114), аналитика месяца и категории (FT-120) |
| `voiceProcessing` | Разбор фразы и голоса: Whisper → GPT, быстрые пути без ИИ, несколько записей за фразу; долги из текста не разбираются (Д2) |
| `quickCapture` | Запись фразой поверх разбора текста (`QuickCaptureService`): текст бота и `POST /api/quick-capture` — Mini App, Shortcut, iOS-приложение; `POST /api/quick-capture/payment` — оплата Apple Pay (FT-176) |
| `category` | Категории пользователя (FT-099): 8 + 8 стартовых, переименование, цвет, скрытие, свои; категория каждой записи (`CategoryResolver`) |
| `account` | Счета (FT-101): остатки при чтении, итог в сумах, начальные остатки первого запуска (FT-109), перемещения — перевод, обмен, корректировка (FT-104) |
| `fx` | Курс доллара (FT-102): ЦБ по дате и свой курс пользователя |
| `user` | telegramId → UUID и настройки пользователя (`user_settings`, FT-098): тема, уведомления, свой курс, счёт по умолчанию, первый запуск, валюта показа |
| `subscription` | Telegram Stars, пробный период, лимиты free (50 записей и 10 голосовых в месяц) — выключены, пока `FREE_LIMITS_ENABLED` не `true` (Д3); судьба `/premium` — #319 |
| `botMessage` | Какие записи показывает каждое подтверждение бота (`bot_messages`, FT-122) и какие сообщения чата уже обработаны (`handled_messages`, FT-172) |
| `notification` | Итоги дня, `/today`, `/month` (FT-124), напоминания о целях, подписках и ревизии (FT-133); каждое — не больше одного раза (`notifications_log`) |
| `export` | CSV всех записей и перемещений (FT-126): скачать или прислать в чат с ботом |
| `auth` | Вход в браузере через бота (FT-128): одноразовая ссылка на 5 минут, сессия — httpOnly-cookie |
| `audit` | Ревизия трат и цели (FT-130, FT-131): `/api/audits`, `/api/goals` |
| `debt` | Только `CreateDebtUseCase` с записью в `debts` — для замороженного пути записи: `createModules()` создаёт модуль для `voiceProcessing` и не возвращает; уберёт #266 после FT-217 |

**Бот** (`src/delivery/messaging/telegram/`; сверено с кодом в #281): меню команд
(`setMyCommands`, FT-124) — `/today`, `/month`, `/undo`, `/help`, `/start`; вне меню `/stats` отвечает как `/month`,
`/premium` и `/cancel_subscription` работают (Д3), любая другая команда — «Такой команды нет. Список — /help»
(`/budget`, `/week`, `/weekly`, `/transactions` тоже). `/start login_<token>` — подтверждение входа из браузера
(FT-128). Текст идёт через `QuickCaptureService`, голос — через `ProcessVoiceInputUseCase`; подтверждение — одно
сообщение на фразу с «Изменить» (поля прямо в чате) и «Отменить» (FT-122), связь сообщения с записями — в
`bot_messages`, обработанные сообщения чата — в `handled_messages`, чтобы повтор от Telegram ничего не менял дважды
(FT-172). Фото, файлы и стикеры — «Пока понимаю текст и голосовые» (#279). Пускает только `ALLOWED_TELEGRAM_IDS`
(FT-153; пустой список вне production — всех); сообщения одного чата — по одному, в порядке Telegram
(`middleware/chatQueue.ts`, #317). В процессе бота,
пока он опрашивает Telegram, работают планировщики `NotificationModule`: итоги дня (FT-124) и напоминания о целях,
подписках и ревизии (FT-133), отправленное — в `notifications_log`. Ссылки в Mini App — только при HTTPS-адресе
`WEB_APP_URL` (#278) и без Telegram id в адресе (#281). Только русский.

**Данные.** TypeORM + SQLite (`data/database.sqlite`); схема меняется только миграциями
(`src/shared/infrastructure/database/migrations/`), они применяются при старте после копии базы в `data/backups/`;
`synchronize` выключен (Д6, FT-090). Пути `supabase-js` в `src/` нет; SQL Supabase в корневой `migrations/` и
скрипты `supabase:*` остались от проекта на паузе. Таблицы: `transactions`, `categories`, `accounts`,
`account_moves`, `fx_rates`, `users`, `user_settings`, `subscriptions`, `usage_limits`, `bot_messages`,
`handled_messages`, `notifications_log`, `login_tokens`, `audits`, `goals`; `budgets`, `debts` и `debt_payments`
остались с прежними строками, код их не читает.

`transactions`: `amount_minor` (целые минорные единицы), `currency`, `account_id`, `category_id`, `type`,
`semanticType`, `needsReview`, `description`, `date` (без времени), `merchant`, `confidence`, `originalText`,
`originalParsing`, `source` (откуда запись), `client_id` (повтор без дубля, FT-106), `search_text` (поиск, FT-107),
`deleted_at` (мягкое удаление, FT-105), `isArchived` (архивные скрыты отовсюду, Д7), `legacy_category` (категория до
FT-099), `userId`. `isDebtRelated`, `relatedDebtId`, `tags` и `splitGroupId` в схеме есть, при записи не заполняются.

**Деньги.** Суммы — целые минорные единицы: тийины для сумов, центы для долларов (FT-097). Счета в сумах или
долларах (`Currency = 'UZS' | 'USD'`); запись хранит свой счёт и валюту, остаток счёта считается при чтении.
Перемещения между счетами — `account_moves`: `transfer`, `exchange`, `adjustment` (FT-104). Курс — ЦБ на дату или свой
(FT-102); итог и плитки в сумах — по действующему курсу. Правила — [`money-model.md`](money-model.md).

**Категории.** Таблица `categories`, у каждого пользователя свои (FT-099): 8 + 8 стартовых
(`src/modules/category/domain/categoryPresets.ts`), источник — `CategoryModule`. `src/shared/domain/entities/Category.ts`
— только словарь старых 26 + 7 id и синонимов, чтобы переводить старые значения. Webapp читает `GET /api/categories`
(`useCategories()`), своей копии списка нет; бот строит клавиатуры из категорий пользователя.

**ИИ.** Разбор фразы — `OPENAI_MODEL` (по умолчанию `gpt-4.1-mini`), голос — `WHISPER_MODEL` (по умолчанию
`whisper-1`); промпты — `src/shared/domain/constants/messages.ts`, в промпт идут видимые категории пользователя.
Категорию, которую не назвало ни одно слово записи, ответ помечает в `assumptions` — «?» в боте и на проверке записей
(FT-138). `needsReview` — запись на проверке, в итоги она не входит. Обучение на исправлениях категории (FT-184) общее
для всех: `src/shared/application/learning/`, начальные паттерны — `data/patterns.seed.json`, выученные —
`data/patterns.json`. Фото и QR чеков нет (FT-089, FT-134, FT-135).

**Проверки** (на 2026-11-16). Jest — 149 файлов в `tests/`, 2623 теста (один пропущен); Vitest — 136 файлов в
`webapp/src/`, 1339 тестов. `npm run verify` — сборка backend, типы тестов и скриптов, ESLint webapp, Jest по одному, Vitest, сборка
webapp, проверка шрифтов и токенов, dependency-cruiser.

### Баги первого снимка — что с ними

| Где | Что было | Сейчас |
|---|---|---|
| `SqliteTransactionRepository.update()` | нет ветки для категории — смена категории молча терялась на SQLite | Исправлено в FT-087; с FT-099 правится `categoryId` |
| `callbackHandlers.ts`, «Удалить» в боте | `DeleteTransactionUseCase.execute(transactionId)` строкой вместо `{ id }`; «последняя запись» сравнивала разные ключи | Исправлено в FT-087; с FT-122 «Удалить» старых сообщений — отмена с «Вернуть», памяти о «последней записи» нет |
| `CreateTransactionUseCase` + обработчики бота + middleware `POST /transactions` | счётчик записей free-лимита рос дважды | Исправлено в FT-087: к счётчику записей прибавляет только `CreateTransactionUseCase`, бот считает только голосовые |
| `requireAdmin` | перед ним не было авторизации — всегда 401 | Маршруты с ним убраны в FT-107 и FT-174; остался только на `POST /api/subscription/grant`, после `requireAuth`; админы — `ADMIN_TELEGRAM_IDS` (#255) |
| Репозитории транзакций | `isDebtRelated`, `relatedDebtId`, `tags`, `splitGroupId` не сохраняются | Так и есть; долги из текста не разбираются (Д2), остатки — #266 |

## Webapp — `webapp/src/`

React 19, Vite 7 с `vite-plugin-pwa`, Tailwind 4 (`@theme inline` в `app/styles/globals.css`, токены «Пастели» —
сгенерированный `pastel-tokens.css`), компоненты «Пастели» в `shared/ui/pastel/` (шторка — Radix Dialog), TanStack
Query, zustand, Dexie, React Router 7; ESLint входит в `verify` (#296). Библиотеки графиков, `motion`, React Hook Form
и Zod нет (recharts убран в FT-121, motion — в #289, React Hook Form и Zod — в #290). Вне `pastel/` в `shared/ui` — `error-boundary` и пять
примитивов shadcn (`badge`, `button`, `card`, `progress`, `skeleton`); они, `sonner`, `@radix-ui/react-slot` и
`@radix-ui/react-progress` нужны только виджетам лимитов и подписки (`widgets/usage-limits`,
`entities/subscription/ui`, `features/limit-warning`), которые ни один экран не показывает, — до решения по #319.

Feature-Sliced Design: `app`, `pages` (16), `widgets` (7), `features` (11), `entities` (10), `shared`. 444 файла, из
них 136 — тесты Vitest: чистые функции, компоненты и экраны (jsdom). `entities/debt` — только ключи кэша `debtKeys`:
их сбрасывает запись фразы с долгом (замороженный путь записи, #266).

**Запуск.** `app/index.tsx`: `AppProviders` — `ErrorBoundary` (сбой вне роутера — «Экран не открылся», #240),
`ThemeController`, TanStack Query, `HydrationGate` (ждёт сохранённое состояние zustand, а без связи — и сохранённые чтения),
`UserInitializer`, `OfflineSync` (очередь записей без связи; пока стоит «Откройте Kapelka заново», ничего не
отправляет — #385), `ThemeSettingsSync` и `MiniAppReopenGate` (#316) — вокруг роутера. В роутере перед экранами —
`AuthGate` (вход в браузере, FT-128) и `FirstLaunchGate` (первый запуск, FT-109), рамка экранов — `AppShell`.

**Маршруты** — таблица в [`webapp/README.md`](../../webapp/README.md#routes); источник — `app/router/appRoutes.tsx`,
ссылки в коде — `ROUTES` (`shared/lib/constants/routes.ts`). Коротко: `/` главная (`/?record=<id>` — с карточкой
операции), `/transactions` история, `/add` ручной ввод, `/review` проверка записей фразы, `/offline-voice` и
`/offline-receipt` — голос и чек без связи, `/analytics` и `/analytics/categories/:id`, `/accounts`, `/accounts/:id`,
`/accounts/transfer`, `/audit`, `/more`, `/more/categories`, `/dev/pastel`; любой другой адрес — «Такой страницы нет»
(#222). Каждая страница — свой кусок кода (`app/router/pageLoaders.ts`), куски экранов, куда ведёт главная, грузятся
заранее после неё (`screenPrefetch.ts`, #291); пока кусок грузится — `PageLoader`: у главной `HomeSkeleton`, у
остальных `LoadingScreen`.

**Навигация.** Нижнего бара нет (FT-110): главная открывает историю и аналитику, «Ещё» — остальное. «Назад» вложенных
экранов — BackButton Telegram (`useTelegramBackButton`, `shared/lib/navigation`), вне Telegram — своя круглая кнопка.
`MainButton` Telegram не используется: он есть только в типах `shared/types/telegram.ts`.

**Где что лежит.**

- `shared/api/client.ts` — клиент API: в Telegram `Authorization: tma <initData>`, в браузере httpOnly-cookie сессии
  (FT-128), в разработке без Telegram — `X-Dev-User-Id` из `VITE_MOCK_USER_ID`.
- `entities/*/api` — запросы и мутации TanStack Query, ключи кэша.
- `features/quick-capture` — поле ввода `Composer`, чипы частых трат, проверка записей `/review`, разбор простого
  текста без связи (`model/offlineText`). `features/record-sheet` — карточка операции.
- `shared/lib` — `money` (формат, клавиатура), `undo` (стопка Toast), `dates`, `theme`, `pastel` (цвета категорий),
  `offline` (связь, очередь Dexie в базе `daftar-offline`, сохранённые чтения), `navigation`, `telegram`,
  `plural.ts`, `haptic.ts`.
- `entities/user` — `useUserStore` (zustand): кто вошёл и отказал ли сервер Mini App.

**Чего в webapp нет.** Голоса — он в боте и iOS-приложении (FT-117 снята, микрофон поля ввода говорит «Голос здесь —
скоро»); фото и QR чеков (FT-134, FT-135).
