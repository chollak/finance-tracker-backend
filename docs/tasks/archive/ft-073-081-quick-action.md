# Архив задач — Quick capture и quick action redesign

Вехи 8–9: главный экран как быстрый ввод и первые срезы редизайна Mini App вокруг quick action. Задачи FT-073…FT-081.

Закрыто задач: **9**. Это архив: задачи здесь не переоткрываются и не редактируются.
Активная доска — [`TASKS.md`](../../../TASKS.md), решения по плану — [`decisions.md`](../decisions.md).

---

### FT-073: Minimal Home/Capture primary UX

Status: done
Priority: high
Owner: Claude Code, QA by Hermes
Type: quick-capture-ux

Context:
Quick capture pivot means the Home first flow should not feel like a broad finance dashboard. The primary screen should show fast capture, recent transactions, and only real attention signals; budgets, analytics, premium/usage, stats, and trust formula must not compete with capture.

Definition of Done:
- [x] Home first flow is quick capture + recent transactions, not dashboard-first
- [x] Balance, budgets, premium/usage, stats, and trust formula are removed from Home primary flow without deleting routes/code
- [x] Secondary features remain reachable under More/direct routes
- [x] Screenshot QA at 375 / 390 / 412
- [x] Full verify passed

Verification 2026-09-04:
- Claude Code changed only `webapp/src/pages/home/ui/HomePage.tsx` for implementation: kept `HomeHeader`, `GuestModeBanner`, `TextQuickCaptureCard`, `RecentTransactions`, and `AttentionSummary` only.
- Removed `BalanceCard` and the collapsed dashboard details block (`HomeTrustSummary`, `QuickStats`, `UsageLimitsCard`, `BudgetOverview`) from Home; components/routes were not deleted.
- `npm run test:webapp` — 9 files / 61 tests passed.
- `npm run build:webapp` — passed.
- `npm run verify` — 34 Jest suites / 424 tests, 9 webapp files / 61 tests, backend build, webapp build, dependency-cruiser, madge passed.
- Screenshot QA: `/tmp/qc-home-minimal-audit/screenshots/home-375.png`, `home-390.png`, `home-412.png`; `navCenterDelta=0`; quick capture/recent present; budget/trust/usage primary blocks absent. Audit console had non-blocking external resource `ERR_FAILED` noise only, no app API 4xx/5xx.

---

### FT-074: Quick capture action row and voice/manual states

Status: done
Priority: high
Owner: Claude Code, QA by Hermes
Type: quick-capture-ux

Context:
После FT-073 карточка ввода осталась единственным входом в запись операции, но не объясняла остальные способы. Нужно показать все три входа — чек, голос, текст — и быть честным про то, что реально работает: сканирование чека не сделано нигде, голос работает только в чате бота, текст работает здесь. Отдельно: quick capture пишет операцию на сервер (`POST /api/quick-capture`) и не имеет офлайн-очереди, поэтому без сети нельзя делать вид, что запись принята.

Definition of Done:
- [x] Action row из трёх плиток (`Чек` / `Голос` / `Текстом`) в `TextQuickCaptureCard`
- [x] Недоступное действие помечено визуально и копией (`Скоро`), но остаётся полностью нажимаемым и объясняет рабочую альтернативу (без `aria-disabled`; измерено `scanAriaDisabled=null`)
- [x] Голос даёт честную подсказку про Telegram, а не имитирует запись с микрофона в Mini App
- [x] Офлайн блокирует отправку с явным нотисом и сохранением набранного текста
- [x] Решения вынесены в чистые функции с тестами, без DOM
- [x] Screenshot QA at 375 / 390 / 412
- [x] Full verify passed

Реализация (только `webapp/src/features/quick-capture/`):
- `model/captureActions.ts` + тест — `CAPTURE_ACTIONS`, `nextActiveCaptureAction`, `captureActionHintFor`; `manual` не открывает панель, повторное нажатие активной плитки закрывает подсказку.
- `model/toCaptureOfflineNotice.ts` + тест — копия нотиса и правило «только явный `navigator.onLine === false` считается офлайном».
- `model/useIsOnline.ts` — `useSyncExternalStore` поверх событий `online`/`offline`, оптимистичный server snapshot.
- `ui/TextQuickCaptureCard.tsx`, `index.ts` — рендер row/подсказок/нотиса и экспорт нового API фичи.

Verification 2026-09-04:
- `npm run test:webapp` — 11 файлов / 83 теста passed.
- `npm run build:webapp` — passed.
- `npm run verify` — 34 Jest suites / 424 tests, 11 webapp Vitest files / 83 теста, backend build, webapp build, dependency-cruiser, madge passed.
- Screenshot QA: `/tmp/qc-home-minimal-audit/screenshots/home-375.png`, `home-390.png`, `home-412.png`. Три плитки помещаются в ряд на всех трёх ширинах, голос читается как честная Telegram-подсказка, скан помечен `Скоро`, `navCenterDelta=0`.
- Interaction audit `/tmp/ft074_capture_actions_audit.js` — passed: `voiceHintOk`/`scanHintOk`/`manualFocusOk` = true, `smallButtons` пуст (нет таргетов меньше минимума), `scanAriaDisabled=null` (скан остаётся нажимаемым и объясняет альтернативу). Скриншоты: `/tmp/ft074-capture-actions-audit/home-actions.png`, `voice-hint.png`, `scan-hint.png`.

---

### FT-075: Direct iPhone Shortcut capture API

Status: done (dev/test only — **не продовая auth-модель**)
Priority: medium
Owner: Claude Code, QA by Hermes
Type: quick-capture-api

Context:
Прямой вызов capture-эндпоинта из iPhone Shortcut минует Telegram-авторизацию Mini App. Для локального контура (WSL + SQLite + Cloudflare quick tunnel) это решено узко: Shortcut идентифицирует себя заголовком, обход жёстко выключен в production, а вопросы «как выдавать/отзывать персональный токен и как считать лимиты для не-Telegram источника» вынесены в будущее продовое решение и больше не блокируют локальное использование.

Definition of Done:
- [x] `X-Shortcut-User-Id` задаёт владельца записи: значение заголовка перетирает `userId` в теле и принудительно ставит `source=ios_shortcut`
- [x] Опциональный общий токен: если задан `SHORTCUT_CAPTURE_TOKEN`, запрос обязан прислать совпадающий `X-Shortcut-Capture-Token`, иначе 401 `INVALID_SHORTCUT_TOKEN`
- [x] `NODE_ENV=production` → 403 `SHORTCUT_CAPTURE_DISABLED` (шумный отказ, а не тихий фолбэк на другой auth-путь)
- [x] Запросы без заголовка идут прежним путём через `allowGuestMode` — Mini App и guest не затронуты
- [x] `req.telegramUser` не подделывается, поэтому `verifyOwnership`/`requireAdmin` остаются fail-closed для shortcut-запросов
- [x] `.env.example` содержит пустой плейсхолдер `SHORTCUT_CAPTURE_TOKEN=` с пометкой DEV/TEST ONLY
- [x] Контракт и границы описаны в `docs/QUICK_CAPTURE_API.md` и `docs/IOS_SHORTCUT_ACTION_BUTTON.md`
- [x] Тесты на все ветки (заголовок/без заголовка, токен задан/не задан/неверный, production)

Реализовано 2026-09-04:

- `allowShortcutCapture` в `src/delivery/web/express/middleware/authMiddleware.ts`; `createQuickCaptureRouter` использует его вместо `allowGuestMode` (`src/modules/quickCapture/presentation/controllers/quickCaptureController.ts`).
- Сравнение токена — constant-time через sha256 + `timingSafeEqual`, чтобы не течь длиной ожидаемого значения.
- Rate limit не менялся: capture по-прежнему под общим с `/api/voice/*` `aiRateLimiter` (per-IP).

Проверка:
- `npm test -- quickCaptureRoutes --runInBand` — 18 тестов passed.
- `npm run verify` — 34 Jest suites / 433 теста, 11 webapp Vitest файлов / 83 теста, backend build, webapp build, dependency-cruiser, madge passed.

Осталось как будущее решение Шукура (не блокер):
- Продовая модель auth: персональный токен вместо общего, срок жизни, отзыв, поведение при утечке.
- Отдельный rate limit для не-Telegram источника.
- Нужно ли вообще включать этот путь в проде или Telegram-канала (`FT-076`) достаточно.

До такого решения: не включать обход в production, не выдавать токен третьим лицам, не класть реальные значения в клиентские инструкции.

---

### FT-076: iPhone Action Button guide via Telegram (docs only)

Status: done
Priority: medium
Owner: Claude Code, QA by Hermes
Type: documentation

Context:
Безопасная часть iPhone-капчи не требует ни нового эндпоинта, ни токенов: Shortcut может спросить текст, положить его в буфер и открыть чат с ботом, а дальше работает уже существующий Telegram quick capture. Нужен пошаговый гайд для Шукура, который честно отделяет проверяемое по коду от того, что можно проверить только на устройстве, и явно фиксирует, почему прямой вызов API на момент FT-076 был запрещён (`FT-075` тогда был blocked); позже `FT-075` добавил прямой вызов для dev/test-контура, а продовая auth-модель остаётся будущим решением.

Definition of Done:
- [x] `docs/IOS_SHORTCUT_ACTION_BUTTON.md` описывает цель и безопасный MVP через Telegram
- [x] Пошаговая настройка Shortcut на русском, только с плейсхолдером `<BOT_USERNAME>`, без токенов и секретов
- [x] Разделено: что заполняет Шукур и что нельзя проверить из WSL
- [x] Альтернатива без Shortcut (голосовое/диктовка в чате бота, виджет Telegram)
- [x] Прямой `POST /api/quick-capture` из Shortcut на момент FT-076 явно помечен как заблокированный до решения по auth/токену/отзыву/rate limit (позже `FT-075` разблокировал его только для dev/test; продовая auth — будущее решение)
- [x] Чек-лист проверки на реальном iPhone
- [x] Troubleshooting и ограничения
- [x] Изменения только в документации, без кода и без коммита

Реализовано 2026-09-04 (docs-only):

- Основной вариант A — «запросить ввод → скопировать в буфер → открыть `tg://resolve?domain=<BOT_USERNAME>`», плюс вариант B (лист «Поделиться») и вариант C (префилл через `&text=`) как непроверяемый из WSL эксперимент.
- Зафиксировано по коду, а не предположением: `?start=<payload>` не годится, потому что приходит как команда, а обработчик записи пропускает всё, что начинается с `/` (`src/delivery/messaging/telegram/handlers/messageHandlers.ts:135`).
- Ограничения выведены из фактического контракта: нет `occurredAt`, нет идемпотентности, per-IP rate limit общий с `/api/voice/*`, дата операции = момент обработки (важно, когда локальный бот был выключен).
- Явный запрет на перенос в Shortcut `TG_BOT_API_KEY`, `OPENAI_API_KEY`, `X-Dev-User-Id` и Mini App `initData`.

Проверка:
- `grep` по файлу на токен-подобные паттерны (`sk-`, `bot<digits>:`, `Bearer <value>`, `TOKEN=`, `KEY=`) — совпадений с реальными значениями нет, только плейсхолдеры и имена переменных в запрещающем контексте.
- `git diff --check` — чисто.
- Сборка/тесты не запускались: изменения только в Markdown, кода они не касаются.

---

### FT-077: Home today-spend hero

Status: done
Priority: high
Owner: Claude Code, QA by Hermes
Type: quick-action-ui

Context:
Quick-action redesign needs a daily feedback anchor before the capture card. Current Home showed date/status and then a form-like quick capture card; it did not answer “сколько я сегодня реально потратил?” in the first viewport. The chosen design direction (`1b · Say it — saved`) and new roadmap `.hermes/plans/2026-09-04_173401-quick-action-ui-redesign-roadmap.md` both require a large “spent today” number.

Definition of Done:
- [x] Home shows a compact “Потрачено сегодня” hero above Quick Capture
- [x] The total counts only real expenses for the local day
- [x] Own transfers, savings deposits, cash withdrawals, debt movements, archived rows and `needsReview` rows are excluded
- [x] No new backend endpoint; derive from existing transaction data in the webapp
- [x] Existing budgets/debts/analytics/premium remain absent from Home primary flow
- [x] Tests cover real-expense filtering and date boundary logic
- [x] Screenshot QA: Home at 375 / 390 / 412 with realistic data
- [x] `npm run verify` passes

Implementation 2026-09-04:
- Added `webapp/src/widgets/today-total/` with pure `calculateTodayTotal()` / `formatTodayTotalMeta()` helpers, tests, widget UI and barrel export.
- `TodayTotal` reuses `useTransactions(userId)` and React Query instead of a new backend/dashboard endpoint.
- Home renders the today-spend hero above `TextQuickCaptureCard`; the old dashboard/budget/premium blocks remain absent.
- Hermes fixed Claude Code’s unverified draft (`ReactNode` import and positive amount summing) before final QA.

Verification 2026-09-04:
- `npm run test:webapp` — 17 Vitest files / 138 tests passed.
- `npm run build:webapp` — passed; existing chunk-size/Browserslist warnings only.
- `npm run verify` — backend build, 34 Jest suites / 433 tests, 17 Vitest files / 138 tests, webapp build, `check:fonts`, dependency-cruiser and madge all passed.
- Screenshot QA via Playwright with `X-Dev-User-Id: 131184740`: `/tmp/ft077-home-final/screenshots/home-375.png`, `home-390.png`, `home-412.png`; console errors and bad responses empty; nav center delta `0`; Home shows `ПОТРАЧЕНО СЕГОДНЯ` with real data (`235 000 UZS`, 13 operations, last 14:32).
- Visual caveat: the old “Добавить” CTA and center `+` still compete with quick capture; intentionally deferred to `FT-079`/`FT-080`.

---

### FT-078: Quick Capture card visual redesign

Status: done
Priority: high
Owner: Claude Code, QA by Hermes
Type: quick-action-ui

Context:
`TextQuickCaptureCard` was correct functionally but still read like a long explanatory form. It now behaves more like a command composer: input + send first, compact examples, then honest secondary channel tiles.

Definition of Done:
- [x] Capture card visually dominates as the primary action without becoming wordy
- [x] Text input remains the working Mini App capture path
- [x] Scan and Mini App voice are represented honestly as unavailable/Telegram-only
- [x] Server ack details remain visible but compact
- [x] Offline/guest states remain truthful and do not fake persistence
- [x] Screenshot QA: Home at 375 / 390 / 412
- [x] `npm run verify` passes

Implementation 2026-09-04:
- Reordered `TextQuickCaptureCard`: composer field + submit first, feedback directly below, horizontal example chips, then capture channel tiles.
- Title changed from generic “Быстрая запись” to command-oriented “Запишите одной строкой”.
- Channel tiles remain honest: `Чек / Скоро`, `Голос / В Telegram`, `Текстом / Здесь`.
- Added `.scrollbar-none` utility for horizontal chip rows.

Verification 2026-09-04:
- `npm run test:webapp` — 17 Vitest files / 138 tests passed.
- `npm run build:webapp` — passed; existing chunk-size/Browserslist warnings only.
- `npm run verify` — backend build, 34 Jest suites / 433 tests, webapp tests/build, font check, dependency-cruiser and madge all passed.
- Screenshot QA via Playwright: `/tmp/ft078-home-final/screenshots/home-375.png`, `home-390.png`, `home-412.png`; console errors and bad responses empty; card shows `Запишите одной строкой`, scan `Скоро`, voice `В Telegram`, text `Здесь`.
- Visual caveat: the horizontal example row intentionally shows partial next chip as a scroll affordance.

---

### FT-079: Capture-first bottom dock

Status: done
Priority: high
Owner: Claude Code, QA by Hermes
Type: quick-action-ui

Context:
The mobile dock used to be navigation with a central `+` that opened the old manual `QuickAddSheet`. For quick-action product, the most prominent global control now leads to fast capture: `Записать` focuses the quick-capture textarea on Home, or navigates Home and then focuses it from other routes.

Definition of Done:
- [x] Dock becomes action-first or otherwise makes quick capture the most prominent action
- [x] Recommended labels: center `Записать`; manual form is demoted to non-center fallback
- [x] History and More remain reachable without route deletion
- [x] Manual form is demoted to explicit fallback via ordinary `+` dock item / aria label
- [x] No fake scan/voice implementation is implied
- [x] Hit targets remain >= 44px and center alignment is measured at 375 / 390 / 412
- [x] `npm run verify` passes

Implementation 2026-09-04:
- Added `webapp/src/shared/ui/capture-dock.tsx` with labelled primary `Записать` pill.
- Added `webapp/src/shared/lib/captureFocus.ts` latch so dock press on `/transactions` or `/more` navigates Home and focuses the mounted capture textarea.
- Updated `BottomNav`: left side Home/History, center `Записать`, right side manual fallback `+` and More.
- Updated `TextQuickCaptureCard` to subscribe to capture focus requests and scroll/focus the textarea/card.
- Updated `scripts/mobile-ui-audit.js` so Telegram-mode screenshots inject the dev user header and measure `[data-dock-center]` instead of the old add button.

Verification 2026-09-04:
- `npm run test:webapp` — 18 Vitest files / 143 tests passed, including `captureFocus` tests.
- `npm run build:webapp` — passed; existing chunk-size/Browserslist warnings only.
- `npm run verify` — backend build, 34 Jest suites / 433 tests, webapp tests/build, font check, dependency-cruiser and madge all passed.
- Screenshot QA via `npm run design:audit`: Home / Transactions / More at 375, 390, 412 under `/tmp/ft079-final/{375,390,412}/screenshots/`; issueCount `0` after audit header fix.
- Center measurement: 390 and 412 exactly centered; 375 center delta `+2px`, acceptable visual tolerance with labelled pill.
- Interaction smoke: clicking `Записать операцию` from `/transactions` navigates to `/`, focuses `#quick-capture-text`, no console errors or bad responses.

---

### FT-080: Compact transaction rows for recent list

Status: done
Priority: medium
Owner: Claude Code, QA by Hermes
Type: quick-action-ui

Context:
Recent transactions now feel like a quick correction log after capture, not a heavy management list. Rows are denser, amount stays right-aligned, category/semantic/date context is collapsed into one meta line, and full History remains the management surface.

Definition of Done:
- [x] Recent rows are compact and easy to scan on 375px
- [x] Semantic financial meaning drives amount color and badge visibility
- [x] Review/edit/delete affordances remain reachable
- [x] No full `/transactions` page rewrite in this slice
- [x] Screenshot QA: Home recent list at 375 / 390 / 412
- [x] `npm run verify` passes

Implementation 2026-09-04:
- Added `CompactTransactionRow` for Home recent list; `TransactionListItem` remains for History.
- Added compact display helpers/tests: day labels, meta line, aria label, semantic badge rules.
- Updated `RecentTransactions` to show uppercase `ПОСЛЕДНИЕ`, quiet “Все N транзакций” link, compact rows, and no competing `Добавить` CTA.
- Preserved tap-to-edit and inline needs-review correction chips.

Verification 2026-09-04:
- Fixed one timezone/business-date test failure by parsing operation date as business date, not instant time.
- `npm run test:webapp` — 18 Vitest files / 157 tests passed.
- `npm run build:webapp` — passed; existing chunk-size/Browserslist warnings only.
- `npm run verify` — backend build, 34 Jest suites / 433 tests, webapp tests/build, font check, dependency-cruiser and madge all passed.
- Screenshot QA via `npm run design:audit`: Home at 375/390/412 under `/tmp/ft080-final/{375,390,412}/screenshots/`; issueCount `0`.

---

### FT-081: History page daily-correction redesign

Status: done
Priority: medium
Owner: Claude Code, QA by Шукур
Type: quick-action-ui

Context:
`/transactions` should become a quick History/correction surface: recent-first, day groups, day totals, compact rows. Archive and bulk actions are still useful but should not define the primary daily UX.

Definition of Done:
- [x] History reads as daily correction/review, not admin management
- [x] Search/filter are quieter and do not dominate the empty state
- [x] Archive/bulk actions remain available but secondary
- [x] Compact row component is reused or aligned with Home recent rows
- [x] Screenshot QA: History at 375 / 390 / 412, empty and populated states
- [x] `npm run verify` passes

Реализовано 2026-09-07:

Задача была начата ранее, но подключена не была: в дереве лежали готовые `HistoryDayGroup`,
`formatHistorySubtitle`, `FilterBar autoFocus` и `CompactTransactionRow showDayLabel` — и ни один
из них ничего не использовало. `TransactionsPage.tsx` оставался нетронутым. Красный тест был
симптомом, реальная работа — связать заготовки со страницей.

- `dayGroupSummary.test.ts`: ожидания приведены к реальному выводу `Intl.NumberFormat('ru-RU')` —
  U+00A0 и между тысячами, и перед кодом валюты. Введена именованная константа `NBSP`, чтобы
  невидимый символ был виден в исходнике. Форматтер не менялся: его вывод типографически верный,
  а `formatCurrency` — общий и живёт ещё на ~15 поверхностях.
- `TransactionsPage.tsx` переписан: «Транзакции» → «История», дни через `HistoryDayGroup`,
  `CompactTransactionRow` вместо `TransactionListItem`, подзаголовок через `formatHistorySubtitle`.
- Поиск/фильтр убраны из постоянной вёрстки за кнопку в шапке. Кнопка не рендерится, когда искать
  нечего, поэтому пустой экран остаётся пустым.
- Закрытие поиска сбрасывает фильтры: скрытая панель не должна молча резать список.
- Кнопка поиска не исчезает, пока панель открыта, — иначе переход на пустой скоуп оставлял
  пользователя с открытым поиском и без способа его закрыть.
- Под фильтром итог дня не показывается: «Расходы» над отфильтрованными строками назвал бы дату,
  а посчитал только совпадения (114 000 вместо реальных 235 000).
- В `HistoryDayGroup` расщеплены `showSummary` и новый `dimmed`: раньше отключение итога заодно
  красило карточку серым, и результаты поиска выглядели бы как скрытые.
- `HistoryDayGroup` sticky-заголовок получил `md:top-14` — уезжал под десктопный `TopNav`.
- `FilterBar`: убран `eslint-disable jsx-a11y/no-autofocus` — плагин в конфиге не подключён,
  комментарий сам по себе был lint-error.
- `top-nav.tsx`: «Транзакции» → «История», согласовано с доком (FT-079).

Проверка 2026-09-07:
- `npm run verify` — exit 0: сборка бэкенда, 34 Jest-сьюта / 433 теста, 19 Vitest-файлов /
  178 тестов, сборка webapp, self-hosted-шрифты, dependency-cruiser (177 модулей, 0 нарушений),
  madge (0 циклов).
- `npx tsc -b` и `eslint` по изменённым областям — чисто. Остаются 2 pre-existing
  `react-refresh/only-export-components` в `features/filter-transactions/index.tsx` (файл не
  менялся; линт в `verify` не входит).
- Скриншот-QA 375/390/412: populated, empty, отфильтрованный поиск, sticky-заголовок в скролле,
  скоуп «Скрытые» — `/tmp/ft081-audit/`.
- Машинные проверки в скролле/взаимодействии: 8 дневных групп, 2 заголовка закреплены при
  скролле; фокус после раскрытия поиска — `INPUT`; после закрытия поиска снова 8 групп (фильтр
  сброшен); меню архивной строки — `["Восстановить","Удалить"]`; console errors — ноль.
- Populated-«Скрытые» снят со стабом ответа на сетевом уровне: в локальной БД нет скрытых строк,
  в базу ничего не писалось. Побочно выяснилось, что service worker VitePWA проходит мимо
  `page.route` — нужен `serviceWorkers: 'block'`.

Открыто после закрытия задачи (не блокирует, решение Шукура):
- Итог дня завышен на старых строках: `hermes` −300 000 и `перевел` −500 000 имеют
  `semanticType='expense'` при категории `debt`/`other`. Считается по тем же правилам, что и
  «Потрачено сегодня» на Home, поэтому History и Home друг другу не противоречат — но обе цифры
  завышены, пока не применён backfill (FT-045).
- Формулировка в `CLAUDE.md` «Все исторические транзакции имеют `semanticType = expense`»
  устарела: в базе есть `own_transfer` (2), `saving_deposit` (1), `income` (5).
- `TransactionListItem` больше нигде не используется, но остаётся в барреле `entities/transaction`.
- `formatHistorySubtitle` даёт «3 скрытых записи»; для женского рода после 2–4 обычнее
  «3 скрытые записи».

---
