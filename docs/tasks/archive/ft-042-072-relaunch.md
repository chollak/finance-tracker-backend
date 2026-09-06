# Архив задач — Relaunch: локальный контур и доверие к цифрам

Вехи 0–4 плана Path to Relaunch: сломанные основы, согласованность аналитики и бюджетов, воспроизводимый локальный запуск, разбор исторических данных, ежедневный экран. Задачи FT-042…FT-072.

Закрыто задач: **21**. Это архив: задачи здесь не переоткрываются и не редактируются.
Активная доска — [`TASKS.md`](../../../TASKS.md), решения по плану — [`decisions.md`](../decisions.md).

---

### FT-042: AWS instance reconnaissance

Status: cancelled
Priority: —
Owner: Shukur
Type: infra-research

Отменена 2026-08-13: Шукур решил, что AWS-сервер больше не актуален, работаем только локально. Выяснять состояние инстанса незачем.

Что из задачи осталось полезным и перенесено:
- Расхождение по Supabase: MCP из сессии видит только проект `Tezzy` (`rnmxtzyqcrtpoxmabniv`), а на ID из `CLAUDE.md` (`cttsquvkvkwtxsfrgsrs`) отдаёт `You do not have permission`. В дашборде проект «Finance Tracker» виден и стоит на паузе. Сверить ID — часть FT-049, где приводится в порядок `CLAUDE.md`.

---

### FT-043: Document and verify local end-to-end run without production

Status: done
Priority: high
Owner: Claude Code, QA by Hermes
Type: dev-experience

Context:
Пока прод выключен, единственный способ пользоваться продуктом и получать обратную связь — локальный контур. Бот умеет работать по polling (см. QA-BUG-3), Mini App требует публичный HTTPS-URL, то есть туннель.

Clarification 2026-08-16:
Most implementation already exists via FT-030: `npm run dev:miniapp` uses Cloudflare tunnel, updates local `WEB_APP_URL`, updates Telegram menu, builds, and serves the app. Do not build a second launcher. This task is now documentation + clean verification of the existing flow.

Definition of Done:
- [x] Локальный запуск на SQLite поднимает API, бот и Mini App одной командой
- [x] Бот работает по polling без вебхука и без публичного хоста
- [x] Mini App открывается через туннель, `WEB_APP_URL` подставляется автоматически или описан ручной шаг
- [x] Инструкция записана в `docs/knowledge-base/08-development/quick-start.md`
- [x] Явно указано, какие переменные окружения обязательны для этого режима

Open questions:
- Чем поднимать туннель — cloudflared, ngrok или что-то уже используемое. Решить в начале задачи.

---

### FT-044: Semantic smoke scenarios on live input

Status: done
Priority: high
Owner: Claude Code, QA by Hermes
Type: qa

Context:
Семантические типы (FT-SEM-001…006) покрыты юнит-тестами, но ни разу не проверялись сквозным вводом живого пользователя. План семантики описывает ручной сценарий проверки — его нужно прогнать и зафиксировать результат.

Definition of Done:
- [x] `кофе 25000` → `Расход`, попадает в месячные траты
- [x] `перевел с TBC на Alif 500000` → `Перевод себе`, НЕ попадает в расходы
- [x] `положил на вклад 1000000` → `Вклад / накопление`, НЕ попадает в расходы
- [x] `одолжил Азизу 200000` → долговой флоу создаёт debt `owed_to_me`; обнаружено, что linked transaction ошибочно попадает в ordinary expenses — вынесено в FT-072
- [x] Аналитика, бюджеты и дашборд проверены: переводы/вклады не включаются; debt mismatch вынесен в FT-072
- [x] `/week` formatter/summary выдаёт корректный разбор за прошлую неделю
- [x] Расхождения оформлены отдельными задачами, а не правятся по ходу

Verification 2026-09-03:
- `POST /api/quick-capture` live smoke: `кофе 25000` → `semanticType=expense`, `countsAsRealExpense=true`; transfer → `own_transfer`, `countsAsRealExpense=false`; deposit → `saving_deposit`, `countsAsRealExpense=false`; debt → `debtType=owed_to_me`.
- Dashboard/budget delta: expected real expense delta 25 000; actual dashboard delta 225 000 because debt linked transaction is saved as plain expense. Coffee budget delta was 25 000.
- `/week` check with previous-week disposable rows: real expenses 25 000; excluded movements 1 500 000 (`own_transfer` 500 000 + `saving_deposit` 1 000 000).
- All disposable records from smoke were deleted with HTTP 200.

Evidence: `/tmp/ft044-semantic-smoke-report.json`.

Depends on: FT-043

---

### FT-045: Historical semantic backfill preview

Status: done
Priority: medium
Owner: Claude Code, QA by Hermes
Type: data

Context:
Все транзакции, созданные до FT-SEM-001, лежат с `semanticType = expense`. План семантики сознательно запретил автоматический backfill: неверный вывод типа портит доверие к данным сильнее, чем их отсутствие. Нужен сначала предпросмотр.

Definition of Done:
- [x] Скрипт анализирует историю и предлагает `semanticType` по описанию
- [x] Режим только для чтения: ни одной записи в БД
- [x] Вывод показывает счётчики по предполагаемым типам и список спорных случаев
- [x] Низкая уверенность помечается как кандидат в `needsReview`, а не переписывается молча
- [x] Решение о реальном применении принимает Шукур отдельно, после просмотра отчёта

Verification 2026-09-03:
- Added `npm run preview:semantic` / `scripts/preview-semantic-backfill.ts`; SQLite opens with `OPEN_READONLY` and the script only issues `PRAGMA table_info` + `SELECT`.
- Added pure classifier/report tests in `tests/semanticBackfillSuggestion.test.ts`.
- Local preview output saved to `/tmp/ft045-semantic-preview.md` and `/tmp/ft045-semantic-preview.json`.
- DB checksum before/after preview was identical: `85412dceb5f033175e6ba63a9dc44d25eeae267da14dd655b9f6b491afb97c9b`.
- Current local preview: 80 scanned, 74 candidates, 14 confident, 1 needsReview, 59 unmatched; suggested types: `income=10`, `debt=4`, `own_transfer=1`.
- Targeted tests: `npm test -- tests/semanticBackfillSuggestion.test.ts tests/semanticTransactionParsing.test.ts tests/processTextInput.test.ts --runInBand` — 3 suites / 106 tests passed.
- Script typecheck: `npm run typecheck:scripts` — passed.
- Full gate: `npm run verify` — 34 Jest suites / 424 tests, 7 webapp files / 40 tests, backend build, webapp build, dependency-cruiser, madge passed.

---

### FT-047: Retire the production deploy pipeline

Status: done
Priority: medium
Owner: Claude Code
Type: ci-cd

Context:
Переформулирована 2026-08-13. Исходно задача была «починить деплой», но AWS-сервер выключен из планов, чинить нечего. При этом `deploy.yml` продолжал запускаться на каждый пуш и падать, а красный значок перестал что-либо означать.

История прогонов (уточнена по данным Actions, логи старше нескольких недель уже удалены):

| Период | Прогонов | Провалов | Где падало |
|---|---|---|---|
| 2025-08 | 55 | 10 | — |
| 2026-01 | 61 | 8 | джоб тестов, деплой пропускался |
| 2026-02 … 06 | 0 | 0 | в `main` не пушили |
| 2026-07 | 82 | 82 | `deploy`, `dial tcp ***:22: i/o timeout` |
| 2026-08 | 2 | 1 | там же |

Последний успешный деплой — 2026-01-27. Серия из 83 провалов подряд относится к июльско-августовскому блоку и вся вызвана недоступностью хоста по SSH; январские провалы были другой природы. Промежутка Февраль–июнь в статистике нет просто потому, что пушей не было.

Отдельно проверено: `docker-cleanup.yml` ходит на тот же хост по расписанию, но GitHub сам отключил его как неактивный (`disabled_inactivity`), последний прогон 2026-03-29. Шума не создаёт, трогать не требуется.

Definition of Done:
- [x] `deploy.yml` перестаёт запускаться автоматически: отключён либо переведён на ручной запуск
- [x] В файле рабочего процесса записано, почему он остановлен и что нужно для возврата
- [x] Пуш в `main` больше не порождает падающий прогон
- [x] Остальные workflow (`claude.yml`, `claude-code-review.yml`, `docker-cleanup.yml`) проверены: не завязаны ли они на тот же хост

Реализовано 2026-08-13:

Законсервирован только джоб `deploy`: у него теперь `if: github.event_name == 'workflow_dispatch'`, то есть он запускается лишь вручную. Джоб `quality-gate` продолжает работать на каждый пуш.

Почему не отключён файл целиком: `quality-gate` гоняет `npm run verify` и от сервера не зависит — это единственная работающая CI-проверка в репозитории. Выключив весь workflow, мы бы вместе с шумом потеряли и сигнал. Теперь красный значок снова что-то означает: он загорается, только если реально сломаны сборка, тесты или архитектурные проверки.

Условия возврата записаны комментарием в шапке `deploy.yml`: поднять хост, сверить `SSH_HOST` / `SSH_USER` / `SSH_KEY`, прогнать вручную через «Run workflow», убедиться в зелёном прогоне, затем убрать условие `if`.

Notes:
- Файл намеренно не удалён: при возврате к хостингу расконсервировать дешевле, чем писать заново.
- `claude.yml` и `claude-code-review.yml` работают на событиях GitHub и с сервером не связаны.

---

### FT-052: Analytics detailed category breakdown must respect semantic transaction types

Status: done
Priority: high
Owner: Claude Code, QA by Hermes
Type: correctness

Context:
Главный экран считает: исходящие 12 555 000 − не расходы 9 000 000 − нужно проверить 830 000 = реальные расходы 2 725 000. Вкладка «Аналитика» на тех же данных показывает в «Расходах по категориям» строку «Другое — 9.4M UZS, 39.1%», то есть ровно те переводы, вклад и снятие наличных, которые главная вычла. Знаменатель процентов — весь оборот около 24 млн, включая зарплату 12 млн. Диаграмма с заголовком «Расходы» содержит и доходы, и не-расходы.

Это прямое противоречие ядру продукта: главный дифференциатор работает на одном экране и опровергается на соседнем.

Clarification 2026-08-16:
Claude Code review found that `getMonthlyTrends`, `getSpendingPatterns`, and `getTopCategories` already use semantic filters. Scope this task to the API category breakdown path (`getDetailedCategoryBreakdown` / `/transactions/analytics/categories/:userId`) and its percentage denominator; do not broad-refactor already-correct analytics code.

Definition of Done:
- [x] «Расходы по категориям» включают только `type=expense` с `countsAsBudgetSpending(semanticType)` и без `needsReview`
- [x] Доходы исключены из диаграммы расходов
- [x] Проценты считаются от суммы реальных расходов, а не от общего оборота
- [x] «Тренды по месяцам» используют тот же фильтр
- [x] Итог аналитики сходится с «реальными расходами» главного экрана до сума
- [x] Регрессионный тест: набор из перевода, вклада, снятия, `needsReview` и обычной траты даёт в аналитике только обычную трату

Подтверждено на уровне API 2026-08-13. `GET /transactions/analytics/categories/:userId` на тестовых данных возвращает:

```
salary  12 000 000  47.09%   ← доход внутри «расходов по категориям»
other   10 227 000  40.13%   ← переводы, вклад, снятие наличных
debt       500 000   1.96%
food       325 000   1.28%
```

Знаменатель процентов — 25 485 000, то есть весь оборот. Дашборд на тех же данных даёт реальные расходы 2 758 000. Эндпоинт группирует все транзакции без семантического фильтра и без разделения дохода и расхода.

Notes:
- Логика фильтра уже есть в `budgetService.ts:39-41` — переиспользовать, а не дублировать.

---

### FT-053: Fix budget near-limit threshold scale

Status: done
Priority: high
Owner: Claude Code, QA by Hermes
Type: bug

Context:
`budgetService.ts:69` сравнивает `summary.percentageUsed >= threshold`, где `percentageUsed` считается как `(spent/amount)*100` (`SqliteBudgetRepository.ts:112`, аналогично в Supabase-репозитории), а `threshold` по умолчанию `0.8`. Проценты сравниваются с долей, поэтому под «близко к лимиту» попадает любой бюджет с расходом выше 0.8% от лимита.

Проверено на живых данных: бюджет с использованием 48% возвращается в `nearLimit`. На главной из-за этого висит «Близко к лимиту бюджета: 3», хотя все три бюджета помечены «На пути».

Definition of Done:
- [x] Выбран и задокументирован единый масштаб: доля 0–1 либо проценты 0–100
- [x] `getBudgetsNearLimit` и все вызывающие стороны приведены к нему
- [x] Публичный контракт эндпоинта `alerts?threshold=` не меняет смысл молча
- [x] Бюджет на 48% не попадает в `nearLimit`, на 85% — попадает
- [x] Тест на границе: 79% / 80% / 81%
- [x] Карточка «Что важно сейчас» согласована с бейджами на карточках бюджетов

---

### FT-055: Budgets page duplication and period labelling

Status: done
Priority: medium
Owner: Claude Code, QA by Hermes
Type: ux

Context:
Страница `/budgets` показывает одни и те же три бюджета дважды: сначала сводной карточкой «Бюджеты / Активные: 3», следом секцией «Все бюджеты» крупными карточками с теми же числами. Примерно половина высоты страницы — повтор.

В карточке бюджета три конфликтующих временных сигнала: подпись «Месячный • июль 2026» при окне 31.07–30.08 и августовских тратах; «19 дней осталось» напечатано дважды в одной карточке; рядом красным «Закончится 17 авг.» — по трём разным датам у трёх бюджетов видно, что это прогноз выгорания, но слово и красный цвет читаются как дедлайн периода.

Definition of Done:
- [x] На странице бюджетов каждый бюджет показан один раз
- [x] Период подписан месяцем, к которому относятся траты
- [x] «Осталось N дней» встречается в карточке один раз
- [x] Прогноз выгорания либо переформулирован однозначно, либо убран
- [x] Красный используется только для превышения, не для прогноза
- [x] Скриншот-проверка на 375 / 390 / 412

Verification 2026-09-03:
- `/budgets` now renders aggregate `Итого по бюджетам` once, then per-budget cards once in `Все бюджеты`; the old `BudgetOverview` list duplication is not used on this page.
- Monthly period labels use the spending month plus exact range, e.g. `Сентябрь 2026 • 01.09–01.10`; weekly labels keep the exact range.
- Budget cards show a single days-left line such as `Ещё 3 дня до 6 сентября`.
- Forecast wording uses `Прогноз:` / `Риск:` and red is reserved for actual exceeded budgets; near-limit/risk uses warning.
- Webapp tests: `npm run test:webapp` — 8 files / 45 tests passed.
- Full gate: `npm run verify` — 34 Jest suites / 424 tests, 8 webapp files / 45 tests, backend build, webapp build, dependency-cruiser, madge passed.
- Screenshot QA: `/tmp/ft055-budgets-audit-content/screenshots/budgets-375.png`, `budgets-390.png`, `budgets-412.png`, plus `budgets-390-bottom.png`; authenticated metrics had `issueCount=0` and centered nav button at 187.5/195/206px respectively.

---

### FT-056: Transaction row readability

Status: done
Priority: medium
Owner: Claude Code, QA by Hermes
Type: ux

Context:
В списке транзакций на 390px описание обрезается почти в каждой строке: «Обед в столо…», «Оплатил сч…», «Снял нали…», «Коммуналк…», «Положил …». Колонка суммы и кнопка «⋮» забирают ширину у главного содержимого строки.

Там же в каждой строке печатается время создания записи, а не дата операции — все засеянные транзакции показывают «00:31», момент вставки. Строки при этом уже сгруппированы заголовками «Вчера», «11 августа», так что время и бесполезно, и вводит в заблуждение.

Дополнительно: бейдж «Расход» в каждой строке повторяет то, что уже сказано цветом и знаком суммы.

Definition of Done:
- [x] Описание помещается или обрезается заметно реже при типичных данных
- [x] Время операции либо убрано, либо показывает время самой операции
- [x] Дублирующий бейдж «Расход» убран; не-расходные пометки сохранены
- [x] Проверено на описаниях длиной 10, 25 и 40 символов
- [x] Скриншот-проверка на 375 / 390 / 412

Verification 2026-09-03:
- `TransactionListItem` now allows two-line descriptions, uses a smaller icon/gap, and does not reserve a fixed time column.
- CreatedAt/insertion time is removed from transaction rows; date grouping remains the time context.
- Ordinary `semanticType=expense` rows do not render the duplicate `Расход` badge; non-expense badges/hints such as `Перевод себе` + `Не считается расходом` remain.
- Added `transactionRowDisplay` pure helpers/tests; checked 10/25/40+ character descriptions.
- Webapp tests: `npm run test:webapp` — 9 files / 59 tests passed.
- Webapp build: `npm run build:webapp` — passed.
- Full gate: `npm run verify` — 34 Jest suites / 424 tests, 9 webapp files / 59 tests, backend build, webapp build, dependency-cruiser, madge passed.
- Screenshot QA with disposable FT056 rows: `/tmp/ft056-transactions-audit-content/screenshots/transactions-375.png`, `transactions-390.png`, `transactions-412.png`; metrics had `issueCount=0`, no `HH:mm` insertion time, ordinary expense badge count `0`, non-expense hint and own-transfer badge present. Disposable rows deleted with HTTP 200.

---

### FT-057: Collapse semantic correction chips

Status: done
Priority: medium
Owner: Claude Code
Type: ux

Context:
У каждой операции с `needsReview` инлайн развёрнут ряд из семи чипсов коррекции. Строка становится втрое выше соседних и рвёт ритм списка. На двух операциях это терпимо, на десяти список перестанет читаться — а `needsReview` по замыслу должен накапливаться.

Definition of Done:
- [x] Чипсы раскрываются по действию, а не всегда
- [x] Свёрнутое состояние сохраняет заметность: видно, что операция требует решения
- [x] Высота такой строки сопоставима с обычной
- [x] Проверено на списке минимум с пятью `needsReview`

Verification 2026-09-04:
- `TransactionCorrectionChips` now starts collapsed with a compact `Исправить тип` action; semantic correction choices render only after expansion.
- `TransactionListItem` keeps `Нужно проверить` visible and places the correction action next to it, so collapsed rows no longer render the seven chips inline.
- Added pure display helper tests for collapsed/expanded correction labels.
- Webapp tests: `npm run test:webapp` — 9 files / 61 tests passed.
- Full gate: `npm run verify` — 34 Jest suites / 424 tests, 9 webapp files / 61 tests, backend build, webapp build, dependency-cruiser, madge passed.
- Screenshot QA with five disposable `needsReview` rows: `/tmp/ft057-corrections-audit-content/screenshots/transactions-375-collapsed.png`, `transactions-390-collapsed.png`, `transactions-412-collapsed.png`, plus expanded-first screenshots. Authenticated audit `issueCount=0`; five collapsed actions visible; first expanded row shows choices while other rows stay collapsed. Disposable rows deleted with HTTP 200; leak check `0`.

---

### FT-058: Touch target compliance

Status: done
Priority: medium
Owner: Claude Code
Type: ux

Context:
Гайдлайны требуют минимум 44×44px и рекомендуют 48. Замер на 390px: кнопки «⋮» — 32×32 и их 16 штук на экране транзакций (всего 33 элемента меньше нормы на этой странице); табы «Текущие/Скрытые» — 36px; табы долгов — 40px; чипсы категорий в форме бюджета — 32px (27 штук); ссылка «Все →» — 20px.

Definition of Done:
- [x] Интерактивные элементы не меньше 44×44, включая невидимую область нажатия
- [x] Между соседними целями минимум 8px
- [x] Замер повторён скриптом и приложен к задаче
- [x] Визуальные размеры не раздуты ради области нажатия

Verification 2026-09-04:
- Raised shared small buttons/tabs and known compact controls to 44px minimum hit areas without adding new visual hierarchy.
- Fixed: transaction `⋮` actions, Radix tabs, debt segmented tabs, budget category chips, quick-add category/date buttons, home quick income/expense buttons, recent/budget overview links, correction toggle/chips.
- Touch audit script `/tmp/ft058_touch_audit.js` checked `/transactions`, `/debts`, `/budgets/add`, `/` at 390×844 with authenticated dev header. Result: `issueCount=0`, `smallCount=0` on all four routes. Metrics: `/tmp/ft058-touch-audit/metrics.json`; screenshots under `/tmp/ft058-touch-audit/screenshots/`.
- Webapp tests/build passed, then full `npm run verify` passed: 34 Jest suites / 424 tests, 9 webapp Vitest files / 61 tests, backend build, webapp build, dependency-cruiser, madge.

---

### FT-059: Close design-guideline drift

Status: done
Priority: low
Owner: Claude Code
Type: design-system

Context:
Расхождения между `docs/knowledge-base/10-design-guidelines/` и реализацией:

- Пончик категорий использует 7 цветов, включая красный и розовый. Гайдлайн — максимум 6 из заданной палитры, красный зарезервирован под расход/destructive.
- Оценка «73 из 100 — Хорошо» окрашена в оранжевый, который в таблице ролей означает warning. Полоса прогресса при этом чёрная — два разных кодирования одной величины.
- Бейдж «Активен» в долгах синий; синего нет среди четырёх ролей.
- Гайдлайн предписывает Inter 400/600/700 и запрещает вес 500, приложение использует Onest 400..800. В `webapp/index.html:17` выбор Onest прокомментирован как осознанный — значит устарела документация, а не код.

Definition of Done:
- [x] Палитра диаграмм приведена к гайдлайну
- [x] Цвет оценки здоровья согласован со смыслом значения
- [x] Бейдж статуса долга переведён в существующие роли
- [x] Документация обновлена под Onest, диапазон весов зафиксирован явно
- [x] Решено и записано, разрешён ли вес 500 при переходе на Onest

Implementation 2026-09-04:
- `webapp/src/shared/lib/design-tokens.ts` + `webapp/src/app/styles/globals.css`: палитра категорий — ровно 6 цветов (blue, teal, purple, amber, indigo, gray), без зелёного дохода и красного расхода; `--color-chart-1..6` синхронизированы с `colors.chart` (проверяется тестом `design-tokens.test.ts`).
- `webapp/src/widgets/spending-chart/ui/SpendingChart.tsx`: локальный `CHART_COLORS` (8 цветов, включая red/pink) удалён, используется `getCategoryColorByIndex(index)` из общих токенов.
- `webapp/src/widgets/financial-health/lib/healthScore.ts` (+ тест): вынесен хелпер, число/подпись/прогресс-бар кодируются одной ролью (`indicatorClassName={barColor}`); «Хорошо» стало нейтральным `primary`, warning начинается с 40–59.
- `webapp/src/entities/debt/lib/toViewModel.ts` + `model/types.ts`: синий статус убран — «Погашен» = `text-success`, «Отменён» = `text-muted-foreground`, «Активен» = нейтральный `text-foreground`.
- `docs/knowledge-base/10-design-guidelines/design-guidelines.md`: Inter заменён на Onest 400–800; вес 500 явно разрешён для подписей и контролов (кнопки, табы, чипы, лейблы строк) и запрещён как шаг иерархии (там 400 против 600/700); секция chart colors переписана под единый источник токенов.

Verification 2026-09-04:
- `npm run verify` — passed: 34 Jest suites / 433 tests, 14 webapp Vitest files / 99 tests, backend build, webapp build, dependency-cruiser/circular checks.
- Visual QA (390px): `/tmp/ft059-design-audit/screenshots/analytics-390.png`, `analytics-full-390.png`, `debts-390.png`, `home-390.png`.

---

### FT-060: Russian numeral agreement

Status: done
Priority: low
Owner: Claude Code
Type: i18n

Context:
Счётчики не согласуются с числительным: «3 бюджетов», «1 долгов». Правильно — «3 бюджета», «1 долг».

Definition of Done:
- [x] Введена общая функция плюрализации для русского (1 / 2–4 / 5+)
- [x] Заменены все счётчики сущностей в webapp
- [x] Тест на формах 1, 2, 5, 11, 21, 101

Implementation 2026-09-04:
- `webapp/src/shared/lib/plural.ts` (new) + `plural.test.ts` (new): общий хелпер `pluralRu(count, one, few, many)` с правилом 1 / 2–4 / 5+ и исключением 11–14, `pluralWithCount()` (число + форма) и доменные обёртки `pluralDays`, `pluralBudgets`, `pluralTransactions`, `pluralDebts`, `pluralActiveDebts`, `pluralCategories`, `pluralVoiceInputs`. Экспортируется из барреля `webapp/src/shared/lib/index.ts`.
- `webapp/src/entities/budget/lib/plural.ts` удалён: локальный хелпер бюджетов (только `pluralDays`/`pluralBudgets`) заменён общим; `toTotals.ts` и `toViewModel.ts` импортируют из `@/shared/lib/plural`.
- `webapp/src/entities/transaction/lib/transactionCountLabels.ts` (new) + тест: `formatAllTransactionsLabel()` (для одной транзакции числительное убирается — «Все транзакции», иначе «Все 2 транзакции») и `formatTransactionsScopeLabel(shown, total, tab)` («3 из 21 текущей» — прилагательное согласуется с общим числом, а не с показанным). Обе функции экспортируются из `entities/transaction/index.ts`.
- Заменены счётчики: `pages/debts/ui/DebtsPage.tsx` (шапка «N активных долгов» через `pluralWithCount` + две карточки сумм), `pages/budgets/ui/BudgetsPage.tsx` (тернарник `бюджет`/`бюджетов` → `pluralBudgets`), `pages/transactions/ui/TransactionsPage.tsx` (подзаголовок → `formatTransactionsScopeLabel`), `widgets/recent-transactions/ui/RecentTransactions.tsx` (ссылка «Все N транзакций» → `formatAllTransactionsLabel`), `features/create-budget/ui/BudgetForm.tsx` («Выбрано: N категорий» → `pluralCategories`).
- Удалены три локальные копии правила: `getTransactionsWord`/`getVoiceInputsWord`/`getDebtsWord` в `features/limit-warning/index.ts` и `getDaysWord` в `widgets/usage-limits/ui/PremiumStatusCard.tsx` — оба файла теперь используют общие хелперы. Правило плюрализации живёт в одном месте.

Verification 2026-09-04:
- `npm run verify` — passed: 34 Jest suites / 433 tests, 16 webapp Vitest files / 117 tests, backend build, webapp build, dependency-cruiser/circular checks.
- Тесты покрывают требуемый набор форм 1, 2, 5, 11, 21, 101 для каждой доменной обёртки, плюс 11–14 / 111–114 и отрицательные значения.
- Visual QA (390px): `/tmp/ft060-plural-audit/screenshots/debts-390.png`, `budgets-390.png`, `transactions-390.png`, `home-390.png`; метрика подозрительных счётчиков — `suspicious=[]` на всех проверенных маршрутах.

---

### FT-061: Self-host the Onest font

Status: done
Priority: low
Owner: Claude Code
Type: performance

Context:
`webapp/index.html:20` грузит Onest с `fonts.googleapis.com`. В Telegram Mini App на слабой сети первый экран уедет на системный фолбэк, а вёрстка на метриках Onest этого не ожидает. Плюс внешняя зависимость там, где её можно не иметь.

Definition of Done:
- [x] Шрифт лежит в проекте и отдаётся своим сервером
- [x] Подключены только используемые веса
- [x] `font-display` выбран осознанно и обоснован здесь
- [x] Запросов к `fonts.googleapis.com` и `fonts.gstatic.com` не остаётся
- [x] Замерено влияние на размер бандла

Implementation 2026-09-04:
- `webapp/package.json`: добавлена зависимость `@fontsource-variable/onest` — бинарники шрифта приходят из npm, а не из репозитория и не из CDN.
- `webapp/src/app/styles/fonts.css` (new): два `@font-face` (`latin`, `cyrillic`) на variable-файлы пакета с `unicode-range`, чтобы подсеты грузились лениво. Импортируется первым в `webapp/src/app/styles/globals.css`; Vite фингерпринтит woff2 в `assets/`, и их отдаёт наш Express.
- Веса: `font-weight: 400 800` — ровно тот диапазон, который использует дизайн-система (400/500/600/700/800). Variable-файл физически несёт всю ось 100–900 (это ось самого шрифта, урезать её без ресабсеттинга бинарника нельзя), но объявленный диапазон клампит случайные `100`/`900` обратно в шкалу.
- Подсеты: только `latin` и `cyrillic`. UI русский, суммы в UZS («сўм», U+045E входит в cyrillic). `latin-ext`, `cyrillic-ext`, `vietnamese`, `math`, `symbols` не подключены осознанно — символы из этих диапазонов (например `→`, U+2192) уходят на системный фолбэк, ровно как это уже было на Google Fonts.
- `font-display: swap` — обоснование записано в шапке `fonts.css`: шрифт теперь same-origin (нет DNS/TLS до двух чужих хостов до старта запроса), service worker кэширует woff2 CacheFirst, поэтому на повторных открытиях (доминирующий сценарий Mini App) swap-вспышки нет; на холодной медленной загрузке `swap` оставляет плотный финансовый экран читаемым с первой отрисовки. `optional` отвергнут: он посадил бы целую холодную сессию на метрики системного шрифта, под которые вёрстка не рассчитана.
- `webapp/index.html`: удалены `preconnect` на `fonts.googleapis.com`/`fonts.gstatic.com` и `<link>` на стилевой файл Google Fonts; на их месте комментарий со ссылкой на `fonts.css`.
- `scripts/check-selfhosted-fonts.js` (new) + `npm run check:fonts`, встроенный в `npm run verify` перед `analyze`. Проверяет оба конца: в исходниках — наличие `@font-face`, диапазон весов, набор подсетов, `unicode-range` и `font-display` на каждом правиле, импорт `fonts.css` в `globals.css`, токен `--font-family-sans`; в собранном бандле — что woff2 присутствуют и на них ссылается собранный CSS, и что ни один текстовый файл сборки не содержит CDN-хостов. Проверка живёт в Node, а не в Vitest, потому что Vitest по умолчанию не обрабатывает CSS и `import css from './fonts.css?raw'` дал бы пустую строку — ассерты прошли бы по пустоте.

Verification 2026-09-04:
- `npm run verify` — passed: 34 Jest suites / 433 tests, 16 webapp Vitest files / 117 tests, backend build, webapp build, `check:fonts`, dependency-cruiser/circular checks.
- `npm run check:fonts` — размер бандла шрифта замерен: 2 файла, 48.5 KB суммарно (`onest-cyrillic` 15.5 KB, `onest-latin` 33.0 KB); CDN-ссылок нет ни в исходниках, ни в сборке.
- Playwright-замер на живом приложении: `googleFontRequests=[]`, все `onestRequests` идут same-origin на `/assets/onest-*.woff2`. Скриншот: `/tmp/ft061-font-audit/screenshots/home-390.png`.

---

### FT-064: Repair broken dev tooling

Status: done
Priority: high
Owner: Claude Code, QA by Hermes
Type: tooling

Context:
Два скрипта, на которые опирается локальная разработка, не работают:

1. `scripts/seed-test-data.ts` обращается к колонке `telegramId`, в схеме она называется `telegram_id` — падает на первом запросе.
2. `scripts/mobile-ui-audit.js` в режиме `AUTH_MODE=telegram` не доносит заголовок до сервера: `route.continue({ headers })` его теряет. Скрипт при этом отрабатывает без ошибок и снимает девять экранов, где все данные по нулям — выглядит как успешный аудит. Рабочая замена проверена: `route.fetch()` с последующим `route.fulfill()`, либо `extraHTTPHeaders` на контексте.

Второй пункт опаснее первого: молчаливо неверный результат хуже падения.

Definition of Done:
- [x] Seed-скрипт работает против текущей схемы
- [x] Аудит-скрипт реально авторизуется, на снимках видны данные
- [x] Аудит падает или громко предупреждает, если получил 401 хотя бы на один запрос
- [x] `extraHTTPHeaders` не навешивается на кросс-доменные запросы: иначе ломается загрузка шрифта с Google Fonts и снимки уходят на фолбэк-шрифте
- [x] Оба скрипта проверены на чистом запуске

---

### FT-065: Transaction edit is blocked by an optional field

Status: done
Priority: high
Owner: Claude Code, QA by Hermes
Type: bug

Context:
Сохранить отредактированную транзакцию невозможно, если поле «Место» пустое — а оно подписано как **(необязательно)**. Форма подсвечивает его красным и печатает `Invalid input` по-английски посреди русского интерфейса.

Причина: `webapp/src/features/edit-transaction/index.tsx:73` подставляет в форму `merchant: transaction.merchant`, а API отдаёт для этого поля `null`. Схема `webapp/src/features/add-transaction/model/schema.ts:24` объявлена как `z.string().optional()`, что принимает `undefined`, но отвергает `null`. Сообщение `Invalid input` — дефолтный текст zod для несовпадения типа.

Проверено: та же транзакция сохраняется, если вручную вписать что-нибудь в «Место». У всех записей в тестовой базе `merchant = null`, то есть **редактирование сломано практически для любой транзакции**, созданной без указания места.

Definition of Done:
- [x] Транзакция с пустым «Местом» сохраняется
- [x] `null` и `undefined` для необязательных полей обрабатываются одинаково
- [x] Проверены остальные необязательные поля форм на ту же ошибку (`null` из API против `.optional()`)
- [x] Сообщения валидации на русском; `Invalid input` в интерфейсе не появляется
- [x] Тест: загрузить транзакцию с `merchant = null`, изменить сумму, сохранить

Реализовано 2026-08-13 (TDD):

- `webapp/src/features/add-transaction/model/schema.ts` — `merchant` стал `z.string().nullable().optional()`, чтобы форма переживала форму ответа API.
- Нормализация вынесена на границу формы: `edit-transaction/index.tsx` и `add-transaction/index.tsx` отправляют `data.merchant ?? undefined`. TypeScript сам показал эту границу — после правки схемы сборка упала на несовпадении с `CreateTransactionDTO`, и стало видно, что `null` нельзя пускать дальше формы.
- `webapp/src/features/add-transaction/model/schema.test.ts` — четыре теста: без merchant, с `null`, с заполненным, и что пустое описание по-прежнему отвергается.

Проверка:
- Тест на `null` падал до правки и проходит после; остальные три были зелёными с самого начала, то есть существующее поведение не тронуто.
- На живой форме: транзакция с `merchant = null`, «Место» не заполняется, сумма меняется 33011 → 33024, сохраняется, `Invalid input` на экране нет.
- `npm run verify` — exit 0.

Не сделано намеренно: `quick-add/model/schema.ts:23` содержит такой же `z.string().optional()`, но его форма подставляет `merchant: ''`, поэтому `null` туда не попадает. Трогать не стал, чтобы правка осталась минимальной.

---

### FT-066: Archived transactions cannot be restored

Status: done
Priority: high
Owner: Claude Code, QA by Hermes
Type: bug

Context:
`POST /transactions/:id/unarchive` всегда отвечает `404 Transaction not found`, хотя запись лежит в базе с `isArchived = 1` и видна в списке архивных.

Причина: маршрут (`transactionController.ts:449`) проверяет владельца через `getByIdUseCase`, который ходит в `findById`, а тот фильтрует `isArchived: false` (`SqliteTransactionRepository.ts:48`). Проверка падает раньше, чем отработает `UnarchiveTransactionUseCase` — а он как раз использует правильный `findByIdIncludingArchived`. Единственная операция, которой нужна архивная запись, защищена проверкой, которая архивных не видит.

В Supabase-репозитории тот же фильтр `is_archived = false`, то есть на проде поведение было бы идентичным. В интерфейсе действие доступно: вкладка «Скрытые» показывает записи с меню действий.

Definition of Done:
- [x] Разархивация архивной транзакции возвращает 200 и снимает флаг
- [x] Проверка владельца для разархивации видит архивные записи
- [x] Чужую архивную транзакцию по-прежнему нельзя тронуть
- [x] Проверено на обоих репозиториях
- [x] Тест на полный цикл: создать → архивировать → вернуть → запись снова в основном списке

Реализовано 2026-08-13 (TDD):

- `GetTransactionByIdUseCase.execute(id, { includeArchived })` — необязательный параметр, при котором поиск идёт через `findByIdIncludingArchived`. Поведение по умолчанию не изменилось.
- `verifyTransactionOwnershipWithResult` пробрасывает этот параметр дальше.
- Маршрут `POST /:id/unarchive` передаёт `{ includeArchived: true }`. Остальные пять маршрутов, использующих ту же проверку, не тронуты: для чтения, правки, удаления и архивации фильтр по архиву правильный.

Выбор подхода: параметр к существующему use case, а не новый класс — репозиторий уже умеет оба поиска, и так не пришлось менять сигнатуру роутера, `expressServer.ts` и `TransactionModule`.

Проверка (`tests/unarchiveTransactionAccess.test.ts`, 4 теста):
- До правки падали три из четырёх, причём чужая архивная транзакция отдавала **404 вместо 403** — владелец не проверялся вовсе, поиск падал раньше. Этот тест оставлен как защита от того, чтобы починка не открыла дыру.
- На живом сервере: создать → архивировать → вернуть даёт 200, `isArchived` в базе становится 0; попытка вернуть чужую архивную от другого пользователя даёт 403.
- `npm run verify` — exit 0, 29 сьютов / 253 теста.

Оба репозитория используют один и тот же интерфейс `findByIdIncludingArchived`, который уже был реализован и в SQLite, и в Supabase — правка на уровне use case покрывает оба.

---

### FT-067: Amount magnitude words are silently dropped

Status: done
Priority: high
Owner: Claude Code, QA by Hermes
Type: bug

Context:
Фраза «зарплата 12 млн» записывается суммой **12**, а не 12 000 000. То же с «12 миллионов». При этом `confidence = 1` и `needsReview = false` — система полностью уверена в неверном результате, и он не попадает в очередь на проверку. Слово «млн» уходит в описание: `description: "зарплата млн"`.

Причина: `parseObviousSemanticTransaction` (`processTextInput.ts:51`) берёт сумму как `Number(numberMatches[0])` и нигде не обрабатывает множители. Защита от сложного текста ловит пунктуацию, союзы и долговые слова, но не порядок величины — фраза выглядит «простой» и уходит в быстрый путь мимо OpenAI. В `parseSimpleTextTransaction` та же арифметика.

Для сум, где обиходные суммы семизначные, «12 млн» — совершенно нормальный способ записи.

Definition of Done:
- [x] Быстрый парсер либо понимает множители (млн, миллион, тыс, тысяч, к, тыщ), либо считает их признаком сложного текста и отдаёт фразу OpenAI
- [x] Ни при каком исходе текст с множителем не сохраняется с потерянным порядком величины
- [x] Множитель не остаётся в описании и merchant
- [x] Тесты: «12 млн», «12 миллионов», «3.5 млн», «25 тыс», «25 тысяч», «15к», «50 тыщ», «2 млн сум»
- [x] Проверить обратное: «1000000» без слова по-прежнему разбирается верно

---

### FT-068: Cash withdrawal wording is misclassified as a real expense

Status: done
Priority: high
Owner: Claude Code
Type: bug

Context:
«снял в банкомате 300000» сохраняется как `semanticType = expense`, то есть попадает в реальные расходы и завышает траты.

Причина: ветка наличных в `parseObviousSemanticTransaction` срабатывает только когда есть и глагол из `CASH_WITHDRAWAL_VERB_PATTERN` («снял»), и слово из `CASH_INDICATOR_PATTERN` («налич», «нал», «cash», «nakd»). Слова «банкомат» в списке нет, поэтому фраза проваливается в простой парсер и становится обычным расходом с `semanticType = expense`.

План семантики прямо предписывает: `cash_withdrawal` исключается из расходов и помечается как движение наличных.

Definition of Done:
- [x] «снял в банкомате», «снял с карты», «обналичил» распознаются как `cash_withdrawal`
- [x] Проверены узбекские формулировки из существующих паттернов
- [x] Неоднозначные случаи уходят в OpenAI, а не молча в `expense`
- [x] Тесты на каждую формулировку

---

### FT-070: Telegram bot never recovers after a polling conflict

Status: done
Priority: high
Owner: Claude Code
Type: reliability

Context:
Один конкурирующий запрос `getUpdates` роняет поллинг: Telegram отвечает `409 Conflict`, `bot.launch()` отклоняется, в лог уходит «Application will continue without Telegram bot functionality» — и бот не работает **до конца жизни процесса**. Повторных попыток нет. API при этом остаётся здоровым и `/api/health` отвечает 200, так что снаружи всё выглядит нормально.

Воспроизведено случайно во время тестирования: одна диагностическая команда выключила бота на весь прогон.

Отдельно: `bot.launch().then(...)` пишет «Telegram bot started» в `then`, но у Telegraf этот промис резолвится при **остановке** поллинга, а не при старте. Поэтому успешный запуск не логируется никогда, и понять из логов, жив ли бот, невозможно.

Definition of Done:
- [x] После 409 бот пытается переподключиться с нарастающей паузой
- [x] Успешный запуск логируется в момент запуска, а не остановки
- [x] Состояние бота видно снаружи: в `/api/health` или отдельной проверке
- [x] Исчерпание попыток логируется как ошибка, а не как обычное предупреждение
- [x] Тест на восстановление после разрыва

---

### FT-072: Debt quick-capture creates a real-expense linked transaction

Status: done
Priority: high
Owner: Claude Code, QA by Hermes
Type: correctness

Context:
FT-044 live smoke found a semantic accounting bug in the debt flow. `POST /api/quick-capture` for `одолжил Азизу 200000` returns only a debt result (`debtType=owed_to_me`, `transactions=[]`), but the live transaction list gains an extra linked row:

```text
description: одолжил Азизу 200000
category: debt
type: expense
semanticType: expense
needsReview: false
amount: 200000
```

Because this hidden linked transaction is plain `semanticType=expense`, dashboard monthly `totalExpense` increases by 200000. In the full smoke set (`кофе 25000`, transfer 500000, deposit 1000000, debt 200000), expected dashboard expense delta was 25000, actual delta was 225000. Coffee budget delta was correct at 25000, so the bug is specifically the debt-linked transaction semantics/dashboard path.

Definition of Done:
- [ ] Debt quick-capture may create/keep a linked transaction only if it is `semanticType=debt` and excluded from real expenses/budget spending
- [ ] `одолжил Азизу 200000` does not increase dashboard real expenses
- [ ] Debt flow still creates the debt entity with `debtType=owed_to_me`
- [ ] Existing `занял у ...` / repayment cases remain correct
- [ ] Regression test covers hidden linked transaction semantics and dashboard/budget totals
- [ ] Live disposable smoke is rerun and all created records are cleaned up

Source evidence: `/tmp/ft044-semantic-smoke-report.json` from Hermes live smoke.

Implemented 2026-09-03:
- `CreateDebtUseCase.createLinkedTransaction()` now passes `semanticType: 'debt'` and `needsReview: false` into the linked transaction payload.
- `PayDebtUseCase.execute()` now does the same for partial/full payment linked transactions.
- Regression tests added for both debt directions and both payment paths.

Verification:
- RED observed before implementation: new `tests/debt.test.ts` assertion received `semanticType === undefined`.
- Targeted: `npm test -- tests/debt.test.ts tests/processTextInput.test.ts tests/analytics.test.ts tests/dashboardService.test.ts --runInBand` — 4 suites / 120 tests passed.
- Full: `npm run verify` — 33 Jest suites / 393 tests, 7 webapp files / 40 tests, backend build, webapp build, dependency-cruiser, madge passed.
- Live smoke after rebuild/restart: `одолжил Азизу 200000` created debt `owed_to_me` and linked transaction `semanticType=debt`; dashboard monthly `totalExpense` delta was `0`; disposable debt+transaction deleted with HTTP 200.
- Evidence: `/tmp/ft072-live-smoke-report.json`.

---
