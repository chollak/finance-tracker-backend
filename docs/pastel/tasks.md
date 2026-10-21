# Веха 10 — перенос «Пастели»: задачи

Задачи вехи 10 в формате [`docs/tasks/README.md`](../tasks/README.md), с дополнительными полями
`Depends`, `Size` и `Design`. Решения Д1–Д7 из [README](README.md) приняты 2026-10-16, поэтому ни одна
задача не ждёт решения. В `TASKS.md` задачи переносятся по фазам; там же — их текущий статус.

- **Порядок задаёт `Depends`, номер — только рекомендуемая очерёдность.** Задачу можно брать, когда закрыто
  всё из её `Depends` и нет блокирующего решения.
- `blocked` — только когда задача ждёт решения Шукура (как в правилах доски). Ожидание другой задачи видно
  по `Depends`, статус при этом `backlog`.
- Задачи, которые раньше ждали решений: FT-090 (Д6), FT-091 (Д3), FT-099 (Д5, Д2), FT-108 (Д7), FT-110 (Д1),
  FT-124 (Д2, Д3), FT-125 (Д2), FT-128 (Д4). Решения записаны в `docs/tasks/decisions.md`.
- Размер: **S** — до дня работы, **M** — 2–3 дня, **L** — около недели. Оценка грубая, вместе с проверкой.
- После каждой задачи приложение работает: старый экран удаляется в той задаче, которая его заменяет.
- Экран сверяют скриншотом с доской холста из поля `Design`, в светлой и тёмной теме.

---

## Фаза 0. Подготовка

### FT-087: Fix category update, bot delete and double usage count

Status: in_progress
Priority: high
Owner: Claude Code, QA by Hermes
Type: bug
Size: S

Context:
Смена категории теряется на SQLite (`SqliteTransactionRepository.update()` без ветки `category`). «Удалить»
в боте не работает: `callbackHandlers.ts:124` передаёт строку вместо `{ id }`, а «последняя запись»
сохраняется по UUID (`messageHandlers.ts`), читается по telegramId (`callbackHandlers.ts:113`). Счётчик
free-лимита растёт дважды (`createTransaction.ts`, обработчики бота, middleware `POST /transactions`).

Definition of Done:
- [ ] PUT с новой категорией меняет её на SQLite; тест репозитория
- [ ] «Удалить» в боте удаляет запись и снимает кнопки; тест обработчика
- [ ] Одна запись увеличивает счётчик ровно на 1 при любом пути ввода; тест
- [ ] `npm run verify` проходит

### FT-088: Spike voice recording inside Telegram Mini App

Status: backlog
Priority: high
Owner: Claude Code, QA by Hermes
Type: spike
Size: S
Design: «Голосовой ввод», «Нет доступа к микрофону», «Микрофон в браузере»

Context:
В дизайне голос записывается в mini app. Неизвестно, даст ли WebView Telegram микрофон на iOS, Android и
Desktop и в каком формате придёт звук. От ответа зависит FT-117.

Definition of Done:
- [ ] Тестовая страница за туннелем пишет 5 секунд через `getUserMedia` + `MediaRecorder` и шлёт в `POST /api/voice/voice-input`
- [ ] Таблица: iOS, Android, Desktop, браузер — разрешение, формат, распознал ли Whisper
- [ ] Вывод в `docs/tasks/decisions.md`: голос в mini app везде / с запасным «Голосовое — в чат бота» / не делаем

### FT-089: Spike fiscal receipt QR and photo recognition

Status: backlog
Priority: medium
Owner: Claude Code, QA by Hermes
Type: spike
Size: S
Design: ряд «Фото чека»

Context:
QR фискального чека ведёт на `https://ofd.soliq.uz/check?t=…`; открытого API нет. Для чеков без QR нужен
разбор фото моделью с vision. От ответа зависят FT-134 и FT-135.

Definition of Done:
- [ ] На 10 реальных чеках: получаются ли по ссылке из QR магазин, дата и время, позиции, итог
- [ ] Те же чеки по фото: точность итога и позиций, время ответа, цена запроса
- [ ] Вывод в `docs/tasks/decisions.md`: QR + фото / только фото / откладываем чек

### FT-090: Single database path with TypeORM migrations

Status: backlog
Priority: high
Owner: Claude Code, QA by Hermes
Type: repo-hygiene
Size: M

Context:
Схема меняется через `synchronize` (SQLite) и ручной SQL (Supabase, отдельные репозитории на
`supabase-js`). Миграции денег и категорий меняют типы и переносят данные: `synchronize` так не умеет.

Definition of Done:
- [ ] Базовая миграция повторяет текущую схему; на копии рабочей базы ничего не меняет
- [ ] `synchronize` выключен вне тестов; `migration:run` и `migration:revert` описаны в `database-guide.md` и в разделе «Changing Database Schema» `CLAUDE.md`
- [ ] Перед миграцией скрипт копирует `data/database.sqlite`
- [ ] Репозитории `supabase-js` удалены из сборки (или удалены совсем), `DATABASE_TYPE=supabase` даёт понятную ошибку
- [ ] `npm run verify` проходит

### FT-091: Switch to disable free-tier limits

Status: backlog
Priority: medium
Owner: Claude Code, QA by Hermes
Type: billing-policy
Size: S

Context:
Лимиты free (50 записей и 10 голосовых в месяц) будут обрывать ввод, офлайн-очередь и чеки, а дизайн
оплату не делает.

Definition of Done:
- [ ] Переменная окружения выключает проверки лимитов во всех путях ввода; на время вехи 10 лимиты выключены (решение Д3)
- [ ] Код Stars и подписки не меняется; тесты подписки проходят
- [ ] Переменная описана в `CLAUDE.md` и `quick-start.md`

---

## Фаза 1. Основа интерфейса

### FT-092: Pastel tokens, Manrope and themes

Status: backlog
Priority: high
Owner: Claude Code, QA by Hermes
Type: design-system
Size: M
Design: [`tokens.json`](tokens.json), [`design-system.md`](design-system.md) «Цвет», «Типографика», «Telegram»

Context:
Сейчас нейтральный shadcn, Onest и только светлая тема. Нужны токены «Пастели» обеих тем, Manrope и выбор
темы. Старые экраны должны жить на новых токенах до своей замены.

Definition of Done:
- [ ] Токены обеих тем — CSS-переменные в `globals.css`, сгенерированы из `docs/pastel/tokens.json`
- [ ] Имена shadcn (`background`, `foreground`, `primary`, `muted-foreground`, `border`…) указывают на токены «Пастели»
- [ ] Manrope самохостится (`@fontsource-variable/manrope`), Onest удалён, `check:fonts` проходит
- [ ] Тема `telegram` (по `Telegram.WebApp.colorScheme`, со сменой на лету) / `light` / `dark`; вне Telegram — `prefers-color-scheme`
- [ ] Все существующие страницы в тёмной теме без нечитаемого текста — скриншоты на 390

### FT-093: Pastel primitives

Status: backlog
Priority: high
Owner: Claude Code, QA by Hermes
Type: design-system
Size: M
Depends: FT-092
Design: [`components/`](components/) Button, Segmented, Switch, SettingsList, CategoryTile, ProblemScreen, Skeleton

Context:
Простые компоненты без своей логики, на которых стоят все экраны.

Definition of Done:
- [ ] `Button` (главная, неактивная, круглая, текстовая), `Segmented`, `Switch`, `SettingsRow`, `CategoryDot`, `ProblemScreen`, `Skeleton`
- [ ] Касания от 44px; фокус виден; `aria-*` как в описаниях компонентов
- [ ] Страница-витрина в dev со всеми компонентами в обеих темах и с подписями, удлинёнными на 30%; скриншоты

### FT-094: Keypad and undo-stack toast

Status: backlog
Priority: high
Owner: Claude Code, QA by Hermes
Type: design-system
Size: S
Depends: FT-093
Design: [`components/`](components/) Keypad, Toast

Context:
Два компонента с логикой, которую легко сломать: ввод суммы и стопка отмен.

Definition of Done:
- [ ] `Keypad`: «000» для сумов, запятая и 2 знака для USD, первое нажатие заменяет бледную сумму, стирание; тесты чистой функции
- [ ] `Toast` с «Отменить»: у каждого действия свои 4 секунды, отмена с последнего; тесты стопки
- [ ] Отмена вызывает переданную функцию и не рисуется, если её нет (без декоративной отмены)

### FT-095: Sheet, Picker and Calendar

Status: backlog
Priority: high
Owner: Claude Code, QA by Hermes
Type: design-system
Size: M
Depends: FT-093
Design: «Компонент · шторка выбора», «Карточка · выбор категории», «Карточка · выбор даты»

Context:
Шторка снизу — единственный вид всплывающего окна. Выбор категории, счёта и даты — одна и та же шторка
во всех местах.

Definition of Done:
- [ ] `Sheet`: ручка, закрытие свайпом и по фону, фокус внутри, светлее экрана в тёмной теме
- [ ] `Picker` категории (с группами расход / доход) и счёта; догадка ИИ — пунктир, нажатие на неё подтверждает
- [ ] `Calendar`: «Сегодня», «Вчера», месяц с листанием
- [ ] Тесты логики выбора; скриншоты обеих тем

### FT-096: Replace design rules in repo docs with Pastel

Status: backlog
Priority: medium
Owner: Claude Code, QA by Hermes
Type: docs
Size: S
Depends: FT-092

Context:
`CLAUDE.md`, `design-guidelines.md` и `style-direction.md` описывают прежнее направление. Агенты будут
возвращать к нему. Правила про схему базы меняет FT-090, про категории — FT-100.

Definition of Done:
- [ ] `CLAUDE.md`: раздел Design System ведёт на `docs/pastel/`; сказано, что Manrope самохостится намеренно (в дизайн-системе указан Google Fonts)
- [ ] `design-guidelines.md` и `style-direction.md` помечены как архив со ссылкой на новый источник

---

## Фаза 2. Модель денег (backend)

Схема и правила — [money-model.md](money-model.md).

### FT-097: Integer money with backward-compatible writes

Status: backlog
Priority: high
Owner: Claude Code, QA by Hermes
Type: data
Size: M
Depends: FT-090

Context:
`decimal(10,2)` и арифметика `number` не вмещают суммы в сумах и копят ошибки округления. Пока экраны не
заменены, старые писатели должны работать.

Definition of Done:
- [ ] `transactions.amount_minor bigint`; данные перенесены; проверка построчно: `amount_minor = round(amount × 100)`
- [ ] Помощник `Money` без плавающей точки; аналитика, итоги бота и weekly review считают через него (бюджеты не трогаем — Д2)
- [ ] Запись принимает и `amountMinor`, и старое `amount`: `TransactionForm` (POST, PUT), `QuickAddSheet`, quick-add бота, `CreateTransactionUseCase` (ИИ), записи долгов, PUT с обучением — тест на каждый путь
- [ ] Ответы содержат `amountMinor` и `amount`; 250 000 000 сум сохраняются без потерь

### FT-098: User settings

Status: backlog
Priority: high
Owner: Claude Code, QA by Hermes
Type: data
Size: S
Depends: FT-090

Context:
Тема, уведомления, свой курс, счёт по умолчанию, первый запуск — нужны многим задачам ниже.

Definition of Done:
- [ ] Таблица `user_settings` с полями из money-model, значения по умолчанию
- [ ] `GET /api/settings`, `PATCH /api/settings` — пользователь из авторизации, без `:userId` в пути
- [ ] Тесты валидации (время — шаг из дизайна, тема — одно из трёх)

### FT-099: User categories in the database

Status: backlog
Priority: high
Owner: Claude Code, QA by Hermes
Type: data
Size: M
Depends: FT-097

Context:
Категории — статический список из 26 + 7 id, в записи хранится строка. В дизайне 8 + 8 категорий, которые
пользователь переименовывает, перекрашивает и скрывает.

Definition of Done:
- [ ] Таблица `categories`; каждому пользователю 8 + 8 стартовых с цветами из дизайна
- [ ] Записи переведены на `category_id` по таблице money-model с учётом `type`; отчёт «сколько куда»; неизвестное → «Другое» того же типа
- [ ] Перенесены: обучение (`data/patterns.json`, `learning-data.json`), кнопки `quickadd:<id>` бота
- [ ] Промпт ИИ и быстрые пути выбирают из видимых категорий пользователя; синонимы старых категорий — подсказки для новых
- [ ] Разбор долгов выключен по Д2: «долг», «кредит», «рассрочка» → расход «Другое», как в прототипе бота
- [ ] `GET/POST/PATCH /api/categories`: переименовать, цвет, скрыть («Другое» не скрывается), имя уникально без учёта регистра кириллицы

### FT-100: Webapp and bot read categories from the API

Status: backlog
Priority: high
Owner: Claude Code, QA by Hermes
Type: refactor
Size: M
Depends: FT-099

Context:
Около 20 мест в webapp и боте берут категории из статических списков `Category.ts` и
`entities/category/model/categories.ts`.

Definition of Done:
- [ ] Webapp получает категории из API и кэширует их; статический список webapp удалён
- [ ] Бот (клавиатуры, форматтеры, `/stats`) берёт категории пользователя
- [ ] Старые экраны показывают новые названия; в `CLAUDE.md` правила «Single Source of Truth» и «MVP: статические категории» описывают категории в базе
- [ ] `npm run verify` проходит

### FT-101: Accounts and balances

Status: backlog
Priority: high
Owner: Claude Code, QA by Hermes
Type: data
Size: M
Depends: FT-097, FT-098

Definition of Done:
- [ ] Таблица `accounts`; `transactions.account_id`; история каждого пользователя на счёте «Карта»
- [ ] Остаток по формуле money-model: записи до `opening_date` не входят; тесты на `needsReview`, все `semanticType`, архив, удалённые
- [ ] `GET /api/accounts` — счета, итог в сумах, действующий курс и его источник; `POST`, `PATCH` (имя, скрыть, валюта только без операций)
- [ ] Скрытый счёт не входит в итог и не предлагается при вводе

### FT-102: USD rate from the Central Bank with own rate

Status: backlog
Priority: high
Owner: Claude Code, QA by Hermes
Type: feature
Size: S
Depends: FT-098

Definition of Done:
- [ ] Таблица `fx_rates`; курс ЦБ загружается раз в день и при старте; нет ответа — последний известный, с датой
- [ ] Свой курс в `user_settings`: задать, вернуть к ЦБ; `GET /api/rates/usd` — какой курс действует и с какой даты
- [ ] Пересчёт в сумы округляется до целых; тест

### FT-103: Account and currency on every new record

Status: backlog
Priority: high
Owner: Claude Code, QA by Hermes
Type: feature
Size: M
Depends: FT-101, FT-102

Definition of Done:
- [ ] `quick-capture`, голос, бот и ручной ввод сохраняют `account_id`, `currency`, `source`
- [ ] «нал» → «Наличные»; «картой / uzcard / humo» → «Карта»; «$ / долл / usd» → долларовый счёт; иначе счёт по умолчанию; тесты разбора
- [ ] «наушники 55$» сохраняется как 55,00 USD; если долларового счёта нет — запись помечается на проверку, а не теряет валюту
- [ ] Ответ разбора содержит догадки (`assumptions`): «45» понято как 45 000, угадана категория, выбран счёт
- [ ] Один сервис итогов за период (доход, расход, по категориям): доллары — по действующему курсу, учитываются `semanticType` и `needsReview`. Через него считают `analytics/summary`, `dashboard`, `/today`, `/stats` и weekly review — доллары больше не складываются с сумами; тест
- [ ] Контракт iOS Shortcut не изменился; тесты `quickCaptureRoutes` проходят

### FT-104: Transfers, exchanges and balance adjustments

Status: backlog
Priority: high
Owner: Claude Code, QA by Hermes
Type: feature
Size: M
Depends: FT-101, FT-102

Definition of Done:
- [ ] Таблица `account_moves`: перевод (одна валюта), обмен (курс сделки и курс ЦБ на дату), корректировка
- [ ] Перемещения меняют остатки обоих счетов и не попадают в аналитику, итоги дня, ревизию и цели; тесты
- [ ] Мягкое удаление с восстановлением; остатки возвращаются
- [ ] Перевод при одном видимом счёте отклоняется понятной ошибкой
- [ ] `GET /api/accounts/:id/operations` — записи и перемещения счёта по дням

### FT-105: Soft delete and restore

Status: backlog
Priority: high
Owner: Claude Code, QA by Hermes
Type: feature
Size: S
Depends: FT-097

Definition of Done:
- [ ] `DELETE /api/transactions/:id` ставит `deleted_at`; `POST /api/transactions/:id/restore` возвращает
- [ ] Репозиторий по умолчанию отбирает только неудалённые: история, остатки, аналитика, бот, weekly review, выгрузка, обучение
- [ ] Удаление уменьшает счётчик лимита, восстановление увеличивает — как сейчас при удалении

### FT-106: Idempotent create for the offline queue

Status: backlog
Priority: medium
Owner: Claude Code, QA by Hermes
Type: feature
Size: S
Depends: FT-105

Definition of Done:
- [ ] `POST /api/transactions` и `quick-capture` принимают `clientId`; уникален в паре с пользователем
- [ ] Повтор с тем же `clientId` возвращает ту же запись; если она удалена — возвращает её с `deletedAt`, новую не создаёт
- [ ] Тесты на повтор и на гонку двух одинаковых запросов

### FT-107: History query API with search and filters

Status: backlog
Priority: medium
Owner: Claude Code, QA by Hermes
Type: feature
Size: S
Depends: FT-099, FT-101, FT-105

Definition of Done:
- [ ] `GET /api/transactions?q&categoryIds&accountIds&type&from&to&cursor`; мёртвый админский `GET /api/transactions` удалён
- [ ] Поиск без учёта регистра по-русски: «такси» находит «Такси» — по нормализованной колонке `search_text` (заметка, магазин) и по названию категории на момент поиска; тест, в том числе после переименования категории
- [ ] Постранично по курсору, порядок по дате и времени создания

### FT-108: Apply historical semantic backfill

Status: backlog
Priority: medium
Owner: Claude Code, QA by Hermes
Type: data
Size: S
Depends: FT-090

Context:
Все старые записи — `semanticType = expense` (backfill из FT-045 не применён), поэтому прежние переводы
себе и снятия наличных считаются расходами в аналитике прошлых месяцев.

Definition of Done:
- [ ] Превью FT-045 пересобрано и показано Шукуру списком
- [ ] Миграция применяет только одобренные строки; копия базы до неё
- [ ] Итоги прошлых месяцев до и после — в отчёте

---

## Фаза 3. Ввод и исправление

### FT-109: First launch with opening balances

Status: backlog
Priority: high
Owner: Claude Code, QA by Hermes
Type: feature
Size: S
Depends: FT-094, FT-101
Design: «Первый запуск», «Первый запуск · суммы введены»

Context:
Идёт до новой главной: пока не заданы остатки, итог по счетам бессмыслен (у мигрированной «Карты» вся
история и нулевой начальный остаток).

Definition of Done:
- [ ] Экран «Сколько у вас сейчас денег?»: наличные, карта, доллары, своя клавиатура, одна кнопка, «Начать с нуля»
- [ ] Введённое становится начальными остатками с датой сегодня; история до этой даты в остаток не входит, но остаётся в истории и аналитике
- [ ] Показывается, пока не заполнен `onboarded_at`, и новым, и мигрированным пользователям

### FT-110: Home shell without the bottom bar

Status: backlog
Priority: high
Owner: Claude Code, QA by Hermes
Type: feature
Size: M
Depends: FT-093, FT-109
Design: «Главная», «Главная · тёмная»

Definition of Done:
- [ ] Шапка со знаком и круглой кнопкой «Ещё» 48px; переходы в Историю и Аналитику с главной
- [ ] Нижний бар и `TopNav` удалены; на вложенных экранах — Telegram `BackButton`, вне Telegram — своя «Назад»
- [ ] Карточка ввода `TextQuickCaptureCard` пока остаётся (её заменит FT-114)
- [ ] Любой раздел — не дальше 2 нажатий с главной

### FT-111: Balance card, month tiles and recent records

Status: backlog
Priority: high
Owner: Claude Code, QA by Hermes
Type: feature
Size: M
Depends: FT-110, FT-100, FT-103
Design: «Главная», «Главная после первого запуска», [`components/`](components/) BalanceCard, SummaryTiles, TransactionList

Definition of Done:
- [ ] Карточка баланса: итог по счетам, раскрытие по счетам, «Все счета и курс доллара», строка-вывод
- [ ] Плитки месяца (доход, расход); недавние записи по дням
- [ ] Числа совпадают с `GET /api/accounts`; плитки — из сервиса итогов (FT-103); старые `TodayTotal`, `AttentionSummary` удалены
- [ ] Пустая главная после первого запуска подсказывает, как сделать первую запись

### FT-112: Loading skeleton and slow state

Status: backlog
Priority: medium
Owner: Claude Code, QA by Hermes
Type: feature
Size: S
Depends: FT-111
Design: «Загрузка», «Загрузка дольше обычного», [`components/Skeleton.md`](components/Skeleton.md)

Definition of Done:
- [ ] Скелет той же раскладки, пульс выключается при `prefers-reduced-motion`, без спиннера посередине
- [ ] Через 6 секунд — «Дольше обычного…» и «Попробовать снова»; ссылку «Записывать без связи» добавит FT-129

### FT-113: Manual entry with keypad and pickers

Status: backlog
Priority: high
Owner: Claude Code, QA by Hermes
Type: feature
Size: M
Depends: FT-094, FT-095, FT-100, FT-103, FT-110
Design: «Ручной ввод», «Ручной ввод · тёмная»

Definition of Done:
- [ ] Сумма на `Keypad`, «Расход / Доход», счёт, плитки категорий, дата через `Picker`, заметка
- [ ] Одна главная кнопка «Сохранить расход»; после — главная, Toast «Записано» с отменой
- [ ] `/transactions/add` и `QuickAddSheet` удалены

### FT-114: Text capture, quick chips and AI review

Status: backlog
Priority: high
Owner: Claude Code, QA by Hermes
Type: feature
Size: M
Depends: FT-100, FT-111, FT-113
Design: «Главная», «Проверка записей», «Проверка · категория под вопросом», [`components/Composer.md`](components/Composer.md)

Definition of Done:
- [ ] Поле ввода с отправкой, кнопками микрофона и камеры (до FT-117 и FT-135 — честные подсказки)
- [ ] Чипы частых трат пишут в одно касание. Правило отбора — константа с тестом (предложение: до 6 самых частых пар «категория + заметка + сумма» за 30 дней, от 3 повторов; новичку — 4 стартовых из прототипа)
- [ ] Несколько записей из одной фразы — одна проверка; догадка ИИ — «Кафе ?»; нажатие подтверждает, `Picker` меняет; «"45" понял как 45 000 сум» из `assumptions`
- [ ] Toast отменяет все записи сообщения; `TextQuickCaptureCard` удалён

### FT-115: Transaction sheet with autosave and undo

Status: backlog
Priority: high
Owner: Claude Code, QA by Hermes
Type: feature
Size: M
Depends: FT-100, FT-105, FT-113
Design: «Карточка операции», «Компонент · карточка операции», «Карточка · правка суммы», «Карточка · выбор категории», «Карточка · выбор даты»

Definition of Done:
- [ ] Строка открывает карточку; кружок категории сразу открывает выбор категории
- [ ] Каждое изменение сохраняется сразу, «✓ Сохранено» 2 секунды; строка после «Готово» обводится на 2 секунды
- [ ] «Удалить операцию» без подтверждения, Toast с отменой (восстановление)
- [ ] Смена счёта на другую валюту оставляет число и предлагает «Пересчитать: 11,46 USD»
- [ ] `/transactions/:id/edit` удалена

### FT-116: History screen with search and filters

Status: backlog
Priority: medium
Owner: Claude Code, QA by Hermes
Type: feature
Size: M
Depends: FT-107, FT-115
Design: «История», «История · «такси» + Наличные», «История · ничего не найдено»

Definition of Done:
- [ ] Поиск и чипы фильтров (категория, счёт, тип) через `Picker`; постраничная загрузка
- [ ] Группы по дням с итогом дня; строка открывает карточку
- [ ] «Ничего не найдено» с «Сбросить»; вкладки «Текущие / Скрытые» и «Скрыть все» удалены

### FT-117: Voice capture inside the Mini App

Status: backlog
Priority: medium
Owner: Claude Code, QA by Hermes
Type: feature
Size: M
Depends: FT-088, FT-114
Design: «Голосовой ввод», «Нет доступа к микрофону», «Микрофон в браузере», «Ничего не расслышал»

Definition of Done:
- [ ] Объём — по выводу FT-088
- [ ] Запись, «Расслышал: «…»», переход к проверке
- [ ] Нет доступа: как включить и «Написать текстом» (в браузере — свой текст); не расслышал: пример фразы и «Ещё раз»

### FT-137: Сум / USD on Home and accounts in board order

Status: backlog
Priority: medium
Owner: Claude Code, QA by Hermes
Type: feature
Size: S
Depends: FT-098, FT-102, FT-109, FT-111
Design: «Главная», «Главная · тёмная», [`components/`](components/) BalanceCard, Segmented

Context:
Переключатель «Сум / USD» есть в шапке главной на всех досках, но не был ни в одной задаче; порядок счетов на
досках — «Наличные, Карта, Доллары», а первый запуск ставил «Карту» первой. Решение Шукура 2026-10-20
(`docs/tasks/decisions.md`): переключатель — отдельной задачей, порядок — как на досках.

Definition of Done:
- [ ] «Сум / USD» (`Segmented`) в шапке главной переводит карточку баланса и плитки месяца в доллары по
      действующему курсу (свой или ЦБ); суммы — через `formatMinor`
- [ ] Выбор помнится между запусками (настройки пользователя, FT-098)
- [ ] Без курса «USD» недоступен, и видно почему; итог в сумах не меняется
- [ ] Счета показываются в порядке досок: Наличные, Карта, Доллары — у новых и у перенесённых пользователей
      после первого запуска (порядок ставит первый запуск, не правка данных)

### FT-138: «?» only for categories the AI guessed

Status: backlog
Priority: medium
Owner: Claude Code, QA by Hermes
Type: fix
Size: S
Depends: FT-114
Design: «Проверка записей», «Проверка · категория под вопросом»

Context:
После FT-114 догадка `assumptions: { kind: "category" }` ставится всякий раз, когда фраза прямо не называет
категорию, поэтому «такси» → «Транспорт ?», «кофе» → «Кафе ?»; на доске «?» только у одной записи. Решение
Шукура 2026-10-20 (`docs/tasks/decisions.md`): «?» — только когда категорию угадал ИИ.

Definition of Done:
- [ ] Догадка о категории не ставится, если категорию дали синоним из словаря категорий или выученный паттерн
      пользователя; ставится, если её выбрал ИИ сам
- [ ] Проверка записей показывает «?» только у таких записей; бот («когда ИИ не уверен») — по тому же правилу
- [ ] `docs/pastel/api.md` описывает правило

### FT-139: Per-user API rate limit for signed-in users

Status: backlog
Priority: high
Owner: Claude Code, QA by Hermes
Type: fix
Size: S
Depends: FT-115, FT-116

Context:
Общий лимит `standardRateLimiter` — 100 запросов за 15 минут с адреса. Автосохранение карточки (FT-115) и поиск
в истории (FT-116) упираются в него в обычной работе, и экраны отвечают «Попробуйте снова». Решение Шукура
2026-10-20 (`docs/tasks/decisions.md`): считать по пользователю, вошедшим — 600.

Definition of Done:
- [ ] Общий лимит считается по пользователю Telegram (initData, вне production — `X-Dev-User-Id`), без входа —
      по адресу
- [ ] Вошедшим — 600 запросов за 15 минут, без входа — 100; два пользователя с одного адреса не делят лимит
- [ ] Лимиты ИИ (разбор фраз, голос, быстрая запись) не меняются
- [ ] Тесты: 101-й запрос без входа — 429; вошедший проходит дальше 100; разные пользователи — разные счётчики

### FT-140: New user created once under parallel first requests

Status: backlog
Priority: high
Owner: Claude Code, QA by Hermes
Type: bug
Size: S
Depends: FT-139

Context:
Найдено при FT-139: `SqliteUserRepository.getOrCreate` сначала ищет пользователя, потом вставляет. Когда первые
запросы нового пользователя приходят одновременно (главная читает сразу несколько маршрутов), часть отвечает 500
`UNIQUE constraint failed: users.telegram_id` — 6 из 20 в пробе.

Definition of Done:
- [ ] Одновременные первые запросы нового пользователя создают одну строку `users` и все отвечают без ошибки
- [ ] Тест на временной SQLite: 20 параллельных `getOrCreate` с одним telegram id — одна строка, 20 успехов
- [ ] Настройки, категории и счета нового пользователя тоже создаются один раз (проверить тем же тестом)

### FT-141: Review follow-ups after FT-119, FT-120 and FT-140

Status: backlog
Priority: medium
Owner: Claude Code, QA by Hermes
Type: fix
Size: M
Depends: FT-119, FT-120, FT-140
Design: «Курс доллара · свой курс», «Обмен · тёмная», «Новый счёт», «Изменить или скрыть счёт»

Context:
Мелкие находки ревью, которые не блокировали задачи. Правила — `docs/tasks/decisions.md`, запись 2026-10-20
«решения FT-140, FT-119, FT-120».

Definition of Done:
- [ ] `usage_limits` создаётся один раз при параллельных первых записях (без ошибки ключа в логе); тест на
      временной SQLite
- [ ] Настройки: запись меняет только переданные поля и `updated_at`; три параллельных PATCH разных полей
      сохраняют все три; тест
- [ ] Перевод: после ухода с экрана во время записи нет перехода назад (тест); на 375×640 форма прокручивается и
      сохраняет нижний отступ; пустое авто-«Получаю» долларового счёта — «0,00»
- [ ] `Segmented` в шторке в тёмной теме показывает ползунок, как на досках (курс, новый счёт, изменить счёт)
- [ ] Аналитика: тесты на каждое правило (рост раньше снижения, граница 7 дней, удалённые и архивные не двигают
      первый месяц, доллары по курсу); ответ категории несёт признак первых дней; текущий месяц — весь
      календарный месяц, как плитки главной (тест с записью на будущую дату); оговорка про доход в
      `design-system.md`; `GetCategoryAnalyticsUseCase` — в своём файле

### FT-142: Review follow-ups after FT-131

Status: backlog
Priority: high
Owner: Claude Code, QA by Hermes
Type: fix
Size: S
Depends: FT-131

Context:
Находки ревью FT-131, которые нужны экранам ревизии (FT-132). Правила — `docs/tasks/decisions.md`, запись
2026-10-21 «решения FT-130 и правила по ревью FT-131».

Definition of Done:
- [ ] Итог ревизии: сумма месяца и «на лишнее ушло» считают только траты этого месяца; перенесённые из прошлой
      ревизии — отдельным числом; тест
- [ ] Состав ревизии не фиксируется чтением: до первой отметки или «Готово» кандидаты находятся заново при
      каждом `GET /api/audits/current`, после — замораживаются; тест с записью, добавленной после первого чтения
- [ ] Цель «отменить» знает, подписка это или тариф (`serviceKind`), чтобы экран писал «отменить / Уже отменено /
      Отмените в самом сервисе» или «отключить / Уже отключено / Отключите у оператора»; `api.md`
- [ ] Синхронизация целей не создаёт цель для траты, которую тем временем отметили «Нужно» (перепроверка решения
      перед созданием); тест

---

## Фаза 4. Счета

### FT-118: Accounts list and account screen

Status: backlog
Priority: high
Owner: Claude Code, QA by Hermes
Type: feature
Size: M
Depends: FT-104, FT-111
Design: «Счета · итог, курс, список», «Счёт «Карта» · операции», «Обмен · подробнее и удаление», «Сверить остаток», «Изменить или скрыть счёт», «Новый счёт», «Скрытые счета»

Definition of Done:
- [ ] Список: итог, строка курса, «≈ … сум» у долларового счёта, «Скрытые счета · N»
- [ ] Экран счёта: остаток, начальный остаток с датой, «Перевести» / «Обменять», «Сверить остаток», операции и перемещения по дням
- [ ] Шторка «Подробнее» у перемещения: удалить с Toast и отменой
- [ ] Новый счёт, изменить, скрыть; «Для перевода нужен второй счёт»
- [ ] Сверить остаток: пустое поле и совпадающий остаток не включают кнопку; разница — корректировкой

### FT-119: Transfer and exchange form, own rate

Status: backlog
Priority: high
Owner: Claude Code, QA by Hermes
Type: feature
Size: M
Depends: FT-118
Design: «Перевод между счетами», «Обмен сумы → доллары», «Курс доллара · свой курс»

Definition of Done:
- [ ] Одна форма: одна валюта — перевод, разные — обмен «Отдаю / Получаю», «Получаю» сначала по ЦБ с меткой
- [ ] Курс сделки и разница словами: «разница 15 000 сум не в вашу пользу»; сказано, что перевод не попадает в расходы
- [ ] Свой курс на `Keypad`, «Готово», Toast с отменой; «Вернуть курс ЦБ»

---

## Фаза 5. Аналитика

### FT-120: Analytics API with fair comparison

Status: backlog
Priority: medium
Owner: Claude Code, QA by Hermes
Type: feature
Size: M
Depends: FT-099, FT-103, FT-105

Context:
Правила — [`design-system.md`](design-system.md), раздел «Аналитика». Прошлые месяцы станут точнее после
FT-108 (backfill), но от него не зависят.

Definition of Done:
- [ ] Строится на сервисе итогов из FT-103; расходы месяца по категориям: текущий месяц против тех же дней прошлого, прошлые месяцы — целиком
- [ ] Доходы незаконченного месяца — против всего прошлого месяца, без «падения» («пока нет», «пока 60%»)
- [ ] Вывод: только категории от 3 операций в обоих периодах, сначала самый большой рост, потом снижение; первые 7 дней — без выводов
- [ ] Доли в сумме ровно 100%; доллары пересчитаны по действующему курсу, признак «≈»
- [ ] Категория: по дням и список операций
- [ ] Перемещения, удалённые и `needsReview` не входят; тест на каждое правило

### FT-121: Analytics screens

Status: backlog
Priority: medium
Owner: Claude Code, QA by Hermes
Type: feature
Size: M
Depends: FT-120, FT-110
Design: ряд «Аналитика — куда уходят деньги»

Definition of Done:
- [ ] Вывод, полосы категорий с засечкой прошлого периода, «↑ 40%», «как было», «новое», листание месяцев
- [ ] Категория: столбцы по дням с выбором дня, операции; доходы; прошлый, первый месяц, первые дни, пусто
- [ ] Старые `FinancialHealth`, круговая диаграмма и вызовы `dashboard` из webapp удалены

---

## Фаза 6. Бот

### FT-122: Bot confirmations, field edits and undo

Status: backlog
Priority: high
Owner: Claude Code, QA by Hermes
Type: bot
Size: M
Depends: FT-100, FT-103, FT-105
Design: «Бот · запись текстом и голосом», «Бот · исправление записи», «Бот · выбор категории», «Бот · «не 25, а 28» и /undo», [`components/`](components/) BotRecord, BotKeyboard

Definition of Done:
- [ ] Связь «сообщение бота → записи» в таблице `bot_messages` и переживает перезапуск
- [ ] Подтверждение: «Расход −24 000 сум» жирным, категория и заметка, счёт и абсолютная дата; без эмодзи; несколько записей — одним сообщением; голос — с «Расслышал: «…»»
- [ ] «Изменить» → поле (сумма, категория, счёт, дата) не больше чем за 2 нажатия; категории по 2 в ряд
- [ ] «Отменить» зачёркивает запись и даёт «Вернуть»; `/undo` делает то же; «Открыть в Daftar ↗» отдельным рядом

### FT-123: Bot clarifications and corrections by reply

Status: backlog
Priority: medium
Owner: Claude Code, QA by Hermes
Type: bot
Size: M
Depends: FT-122
Design: «Бот · когда ИИ не уверен», «Бот · доход, доллары, отмена», «Бот · не понял, не расслышал»

Definition of Done:
- [ ] Ответ «не 25, а 28» на подтверждение меняет сумму
- [ ] Угаданная категория: «Записал в «Покупки» — верно?»; неизвестная — «Категорию не узнал»
- [ ] Без суммы: «Сколько?» ждёт только сумму, иначе «"Такси" — без суммы, не записал»
- [ ] Крупная сумма не записывается до подтверждения — правило прототипа: расход в сумах от 10 000 000 в категориях Кафе, Транспорт, Продукты, Связь, Здоровье
- [ ] «45» → 45 000 с пометкой курсивом; не понял, не расслышал — пример фразы

### FT-124: Scheduler, daily summary, start and command menu

Status: backlog
Priority: medium
Owner: Claude Code, QA by Hermes
Type: bot
Size: M
Depends: FT-098, FT-122
Design: «Бот · итоги дня», «Бот · первое сообщение», «Бот · меню команд», [`components/BotNotice.md`](components/BotNotice.md)

Definition of Done:
- [ ] Планировщик в процессе бота; отправки идемпотентны (`notifications_log`: что и за какой период отправлено)
- [ ] Итоги дня в выбранное время по часовому поясу пользователя: сумма, до 3 категорий, одна строка-вывод; пустой день — «Трат правда не было?», не больше 2 вечеров подряд
- [ ] `/today` и `/month` — через сервис итогов из FT-103; числа совпадают с главной
- [ ] `/start` и `/help` — тексты из дизайна; меню через `setMyCommands`; судьба `/budget`, `/week`, `/weekly`, `/stats`, `/transactions`, `/premium`, `/cancel_subscription` — по Д2 и Д3

---

## Фаза 7. Сквозное

### FT-125: More screen, theme and notification settings

Status: backlog
Priority: medium
Owner: Claude Code, QA by Hermes
Type: feature
Size: M
Depends: FT-098, FT-110, FT-118, FT-124
Design: «„Ещё“ — разделы и настройки», «Сводка дня в боте», «Тема», «„Ещё“ в браузере»

Definition of Done:
- [ ] Разделы «Деньги», «Бот в Telegram», «Вид», «Данные» (+ «Аккаунт» в браузере); у строки — текущее состояние
- [ ] Тема меняется сразу; уведомления (сводка и её время, ревизия и её время, цели и подписки) сохраняются и управляют планировщиком
- [ ] Бюджеты и долги убраны из навигации по Д2; старая `MorePage` удалена

### FT-126: Export all records

Status: backlog
Priority: low
Owner: Claude Code, QA by Hermes
Type: feature
Size: S
Depends: FT-104, FT-125

Definition of Done:
- [ ] CSV всех неудалённых записей и перемещений: дата, тип, сумма, валюта, счёт, категория, заметка
- [ ] В Telegram файл приходит в чат с ботом (`sendDocument`), в браузере — загрузка
- [ ] Повторное нажатие, пока идёт выгрузка, не шлёт второй файл

### FT-127: Categories screen

Status: backlog
Priority: medium
Owner: Claude Code, QA by Hermes
Type: feature
Size: S
Depends: FT-100, FT-125
Design: «Категории», «Категория «Кафе»», «Новая категория», «Скрытые категории»

Definition of Done:
- [ ] Переименовать, выбрать один из 8 цветов, скрыть; правка применяется при закрытии шторки, Toast с отменой
- [ ] Новая категория; совпадение имени — понятное сообщение; «Другое» не скрывается
- [ ] Записи скрытой категории остаются в истории и аналитике

### FT-128: Web login through the bot

Status: backlog
Priority: medium
Owner: Claude Code, QA by Hermes
Type: auth
Size: M
Depends: FT-122
Design: «Вход по прямой ссылке», «Вход · ждём подтверждения», «Бот · подтверждение входа», «Вход не подтвердили»

Definition of Done:
- [ ] `POST /api/auth/web-login` — одноразовый токен на 5 минут (`login_tokens`) и ссылка `t.me/<bot>?start=login_<token>`
- [ ] Бот: «Подтвердить» / «Это не я»; страница опрашивает статус и открывается сама; время вышло — так и пишем, с новой ссылкой
- [ ] Сессия — httpOnly-cookie; middleware принимает `tma initData` или сессию; «Выйти»
- [ ] Гостевой режим и `TelegramLoginButton` удалены по Д4

### FT-129: Offline outbox and cached reads

Status: backlog
Priority: medium
Owner: Claude Code, QA by Hermes
Type: feature
Size: M
Depends: FT-106, FT-112, FT-114, FT-117, FT-118
Design: ряд «Без связи, ошибки и загрузка», «Счета · нет связи», [`components/OfflineBar.md`](components/OfflineBar.md)

Definition of Done:
- [ ] Записи кнопками, вручную и простым текстом — в очередь Dexie с `clientId`; уходят при появлении связи, без дублей
- [ ] Разбор на устройстве: «такси 18к, кофе 25к» → 2 записи; «55$» → долларовый счёт; «45» → 45 000 с «проверьте сумму»
- [ ] Строка «Нет связи — записи сохранятся и отправятся сами»; у записи «Ждёт связи · …»; микрофон и камера — `track` и честный экран
- [ ] Главная и счета открываются без связи из сохранённых данных; курс — «Нет связи · курс ЦБ на 13 окт»
- [ ] Медленная загрузка (FT-112) получает ссылку «Записывать без связи»

---

## Фаза 8. Ревизия и цели

Правила — [`design-system.md`](design-system.md), раздел «Ревизия трат».

### FT-130: Spending audit rules

Status: backlog
Priority: medium
Owner: Claude Code, QA by Hermes
Type: feature
Size: M
Depends: FT-120

Definition of Done:
- [ ] Кандидаты только из гибких категорий по 4 правилам (подписка или платный тариф, часто и понемногу, стало чаще, крупная покупка) с порогами из дизайна
- [ ] Одна трата под разными заметками — одна группа в обоих месяцах
- [ ] Каталог подписок — константа в коде (стриминг, музыка, облако, ИИ-сервисы, Telegram Premium), с тестом
- [ ] Причина — утверждение с числами; тесты на данных прототипа

### FT-131: Audit storage and goals

Status: backlog
Priority: medium
Owner: Claude Code, QA by Hermes
Type: feature
Size: M
Depends: FT-130

Definition of Done:
- [ ] Таблицы `audits` (кандидаты и решения) и `goals`; неразобранные кандидаты переходят в следующую ревизию
- [ ] Цели: вдвое меньше, отказаться, отменить подписку (дата списания, «Уже отменено», «Напомнить»)
- [ ] Лимит считается с дня ревизии пропорционально оставшимся дням, округление до тысячи; сравнение с теми же днями прошлого месяца; тесты

### FT-132: Audit screens and Home cards

Status: backlog
Priority: medium
Owner: Claude Code, QA by Hermes
Type: feature
Size: M
Depends: FT-111, FT-125, FT-131
Design: ряд «Ревизия трат», «Главная после ревизии · цели»

Definition of Done:
- [ ] Начало, разбор, итог-план, «лишнего нет», мало данных
- [ ] Главная: приглашение с «Позже» (прячет до завтра, с отменой), после ревизии — «Цели после ревизии»
- [ ] Ревизия открывается и с главной, и из «Ещё»

### FT-133: Goal, subscription and audit reminders in the bot

Status: backlog
Priority: medium
Owner: Claude Code, QA by Hermes
Type: bot
Size: S
Depends: FT-131, FT-124
Design: «Бот · напоминания»

Definition of Done:
- [ ] Цель — один раз на 80% и один раз на превышение; подписка — за день до списания; ревизия готова — в выбранное время
- [ ] «Позже» у ревизии повторяется один раз; всё уважает настройки уведомлений; тесты на повторную отправку

---

## Фаза 9. Чек

### FT-134: Receipt recognition backend

Status: backlog
Priority: low
Owner: Claude Code, QA by Hermes
Type: feature
Size: L
Depends: FT-089, FT-099, FT-103, FT-105

Definition of Done:
- [ ] Объём — по выводу FT-089
- [ ] Черновик из QR или фото: магазин, дата и время, итог, позиции, источник (QR — точно, фото — сверить)
- [ ] Разделение по категориям: записей столько, сколько групп, в сумме — итог; позиции в `transaction_items`
- [ ] Та же сумма в тот же день и близко по времени создания → «Дополнить запись»; тот же чек дважды не записывается (`receipt_ref`)
- [ ] Разделение записи из бота: исходная запись заменяется группами, отмена возвращает исходную
- [ ] Размыто, нет итога, не чек — отдельные ответы

### FT-135: Receipt screens and bot photo flow

Status: backlog
Priority: low
Owner: Claude Code, QA by Hermes
Type: feature
Size: M
Depends: FT-114, FT-122, FT-134
Design: ряд «Фото чека — от камеры до записи»

Definition of Done:
- [ ] Подсказки первые 3 раза (счётчик в настройках), системная камера или галерея (на компьютере — «Выбрать файл»), чтение с отменой
- [ ] Проверка, разделение, «уже записано»; ошибки с выходом «Ввести вручную»
- [ ] После сохранения — главная с подсвеченными записями и Toast с отменой
- [ ] Фото в бота: та же логика, ответ в формате подтверждения

---

## Фаза 10. Уборка

### FT-136: Remove transition leftovers

Status: backlog
Priority: low
Owner: Claude Code, QA by Hermes
Type: repo-hygiene
Size: S
Depends: все задачи вехи

Definition of Done:
- [ ] Удалены `transactions.amount` и `legacy_category`, backend `dashboard`, статический `Category.ts` (кроме стартовых пресетов), неиспользуемые виджеты и хуки webapp
- [ ] Удалены гостевые ветки backend (`guest_*`, решение Д4, ревью FT-128): `allowGuestMode`, `verifyOwnership` в `authMiddleware.ts`, `userIdResolver.ts`, `userResolutionMiddleware.ts`, `ownershipVerification.ts`, `subscriptionController.ts`, `transactionController.ts`; запрос без входа к `/api/dashboard/guest_abc/quick-stats` получает 401
- [ ] Документация (`knowledge-base`, `CLAUDE.md`) описывает новую модель
- [ ] `npm run verify` проходит
