# Backlog

Задачи, снятые с активной очереди. **Не начинать без явного запроса Шукура** — каждая ждёт
либо продуктового решения, либо разрешения на внешнее/рискованное действие.

Активная доска — [`TASKS.md`](../../TASKS.md).

---

### FT-046: Apply Supabase migrations 007 and 008

Status: backlog
Priority: low
Owner: Shukur + Hermes
Type: infra

Context:
Колонок `semantic_type` и `needs_review` в прод-БД нет. Без них включённый прод сломается на первой же семантической транзакции.

Definition of Done:
- [ ] Supabase-проект выведен из паузы
- [ ] Снят бэкап или зафиксирована точка восстановления до применения
- [ ] `007_add_transaction_semantic_type.sql` применена
- [ ] `008_add_transaction_needs_review.sql` применена
- [ ] Схема сверена с ожиданиями репозиториев
- [ ] Приложение проверено против Supabase с `DATABASE_TYPE=supabase`

Blocked by:
- Отсутствие живого прода: с 2026-08-13 работаем локально на SQLite, где TypeORM добавил обе колонки сам при первом запуске
- Явное разрешение Шукура: применение SQL к проду имеет внешний эффект

Notes:
- Задача не отменена, а отложена: миграции понадобятся в тот момент, когда Supabase выйдет из паузы. Пока прода нет, она ничего не блокирует.

---

### FT-048: Upgrade sqlite3 to v6

Status: backlog
Priority: low
Owner: Claude Code
Type: tech-debt

Context:
После `npm audit fix` осталось 7 уязвимостей, все в цепочке `sqlite3@5.1.7` → `node-gyp` → `tar` (critical) + `cacache`. Закрывается только мажорным апгрейдом. После ревизии 2026-08-13 локальный SQLite — основной рабочий контур, поэтому major upgrade может сломать именно то, чем сейчас пользуемся.

Status note 2026-08-16: blocked until Shukur explicitly approves `npm audit fix --force` / major sqlite3 upgrade. Do not run force dependency upgrades autonomously.

Definition of Done:
- [ ] `npm audit fix --force` поднимает `sqlite3` до v6
- [ ] `npm run verify` зелёный
- [ ] SQLite-путь проверен вручную: создание, чтение, обновление транзакции
- [ ] `npm audit` не содержит critical

---

### FT-049: Reconcile task board with GitHub Issues

Status: backlog
Priority: high
Owner: Hermes
Type: process

Context:
Два трекера разошлись. 14 открытых Issues созданы 26–27 января, до всей работы февраля–июля. Часть уже сделана под другими номерами, и невозможно понять, что реально открыто.

Clarification 2026-08-16: this is not just issue hygiene. `TASKS.md` says local board is source of truth, while older `CLAUDE.md` said GitHub-first workflow is mandatory. Until this is reconciled, LLM agents receive conflicting instructions. First slice: make the source-of-truth rule explicit in repo docs; full GitHub issue cleanup can follow.

Definition of Done:
- [ ] Каждое открытое Issue помечено: сделано / актуально / переосмыслено
- [ ] Закрыты перекрытые редизайном: #74, #78, #79, #80
- [ ] #73 (weekly insights) сокращён до незакрытой части — команда `/week` уже есть
- [ ] Актуальные (#70, #81, #71, #72, #75, #76, #77, #83, #84) перепривязаны к вехам этого плана
- [ ] Зафиксировано одним предложением, что считается источником правды: этот файл или Issues
- [ ] `CLAUDE.md` приведён в соответствие с решением

---

### FT-050: Prune stale branches

Status: backlog
Priority: low
Owner: Claude Code
Type: repo-hygiene

Context:
75 удалённых веток на `origin`, большинство мёртвые (`codex/*`, `*-codex`, `by-codex`, `fix/dockerfile`). Шум мешает видеть реальную работу. Локально осталась только `main`.

Definition of Done:
- [x] Для каждой ветки определено, влита она или содержит незабранные изменения
- [ ] Невлитые изменения либо забраны, либо описаны здесь перед удалением
- [ ] Удалены только подтверждённые к удалению ветки
- [ ] Ни одного force push и ни одного удаления без явного подтверждения

Инвентаризация 2026-09-05 (Claude Code, только чтение — ничего не удалено):

Локальных веток кроме `main` не осталось — весь шум на `origin`: **75 удалённых веток**.
Решение Шукура 2026-09-05: **ничего не удалять**, запись сохранена для будущего решения.

**A. Влиты в `main` (10) — уникальных коммитов нет, удаление ничего не теряет:**

| Ветка | Последний коммит | SHA |
|---|---|---|
| `3hk994-codex/-react` | 2025-07-08 | `478adc2` |
| `add-claude-github-actions-1754910333051` | 2025-08-11 | `86dba33` |
| `bxw3u5-codex/создать-workflow-для-деплоя-в-github-actions` | 2025-07-02 | `8d7919a` |
| `codex/-userid` | 2025-07-08 | `90b0a9b` |
| `codex/add-configuration-module-with-dotenv` | 2025-06-08 | `8ba08a9` |
| `codex/fix-missing-environment-variables` | 2025-07-08 | `e1676ae` |
| `codex/refactor-file-system-operations` | 2025-06-08 | `be8d67b` |
| `codex/remove-localfilerepository-and-service-files` | 2025-06-08 | `71a82b4` |
| `codex/remove-unused-imports` | 2025-06-08 | `b29339a` |
| `codex/вывести-ссылку-на-страницу-транзакций-для-бота` | 2025-07-02 | `555acfd` |

**B. Не влиты, мёртвые codex-эксперименты (63) — все против кодовой базы до перехода на Clean Architecture:**

| Ветка | Своих коммитов | Последний коммит | Tip SHA |
|---|---|---|---|
| `by-codex` | 14 | 2025-06-26 | `6cd4c75` |
| `codex/refactor-createopenaichatservice-to-accept-tools-array` | 14 | 2025-06-26 | `373642e` |
| `codex/add-constructor-for-categoryvectorrepository` | 13 | 2025-06-26 | `a4a49c6` |
| `codex/replace-ada-002-with-text-embedding-3-small` | 12 | 2025-06-26 | `2338276` |
| `codex/add-analytics-service-to-docker-compose` | 11 | 2025-06-26 | `b0855a3` |
| `codex/implement-worker-with-cli-entry` | 10 | 2025-06-26 | `fd0d99b` |
| `codex/implement-controller-with-sse-chunking` | 9 | 2025-06-26 | `2781db9` |
| `codex/create-testable-middleware-with-service-injection` | 4 | 2025-06-26 | `f9b951c` |
| `codex/implement-openaiembeddingservice-class` | 4 | 2025-06-26 | `a5b6441` |
| `codex/implement-repository-with-cosine-similarity` | 4 | 2025-06-26 | `4c1a115` |
| `codex/implement-openai-moderation-service` | 3 | 2025-06-26 | `c47cc44` |
| `codex/implement-openaichatservice-with-extracttransaction` | 2 | 2025-06-26 | `d7fb13e` |
| `codex/implement-routing-for-3-intents` | 2 | 2025-06-26 | `9d537c1` |
| `codex/создать-фронтенд-для-mini-app-в-телеграм` | 2 | 2025-07-03 | `d9909fd` |
| `add-claude-github-actions-1754910467326` | 2 | 2025-08-11 | `788de77` |
| `6hor3t-codex/удалить-неиспользуемые-директории-и-файлы` | 1 | 2025-06-08 | `1fe8d94` |
| `codex/complete-or-remove-last-line-in-dockerfile` | 1 | 2025-06-08 | `5e9533d` |
| `codex/fix-missing-jest-types-for-tests` | 1 | 2025-06-08 | `1a4e67a` |
| `codex/fix-openai-import-in-openaitranscriptionservice` | 1 | 2025-06-08 | `8c6b6e8` |
| `codex/refactor-voice-processing-module-structure` | 1 | 2025-06-08 | `314d440` |
| `codex/remove-unused-packages-from-package.json` | 1 | 2025-06-08 | `c97bfa4` |
| `codex/replace-notionrepository-with-transactionrepository` | 1 | 2025-06-08 | `a0a9683` |
| `codex/исправить-ошибки-ts6059-в-tsconfig.json` | 1 | 2025-06-08 | `3c2091d` |
| `codex/исправить-ошибки-компиляции-typescript` | 1 | 2025-06-08 | `e0db6ac` |
| `codex/найти-и-исправить-ошибку` | 1 | 2025-06-08 | `be0968a` |
| `codex/отрефакторить-структуру-под-чистую-архитектуру` | 1 | 2025-06-08 | `b051796` |
| `codex/удалить-неиспользуемые-директории-и-файлы` | 1 | 2025-06-08 | `d243b3e` |
| `codex/интегрировать-бота-с-проектом` | 1 | 2025-06-09 | `b04013a` |
| `codex/проверить-архитектурные-проблемы-и-зависимость-модулей` | 1 | 2025-06-09 | `414616b` |
| `codex/вывести-транзакции-пользователя-в-боте` | 1 | 2025-06-10 | `b7a1a91` |
| `codex/create-transactiondto-class-with-zod-validation` | 1 | 2025-06-26 | `31f3dbe` |
| `codex/добавить-конструктор-параметр-repo-и-тест` | 1 | 2025-06-26 | `b7d763f` |
| `h8wxar-codex/implement-repository-with-cosine-similarity` | 1 | 2025-06-26 | `0d8d6b2` |
| `ch019d-codex/создать-workflow-для-деплоя-в-github-actions` | 1 | 2025-07-02 | `0df39e8` |
| `codex/document-docker-compose-build-and-run-commands` | 1 | 2025-07-02 | `45750ce` |
| `codex/modify-start-script-and-dockerfile` | 1 | 2025-07-02 | `ab21433` |
| `codex/update-node-version-in-dockerfile` | 1 | 2025-07-02 | `2266d92` |
| `codex/обзор-текущего-состояния-проекта` | 1 | 2025-07-02 | `9c1cd39` |
| `codex/обновить-ссылку-в-telegram-mini-app` | 1 | 2025-07-02 | `dedefb7` |
| `codex/создать-workflow-для-деплоя-в-github-actions` | 1 | 2025-07-02 | `8a08e69` |
| `lksk66-codex/вывести-ссылку-на-страницу-транзакций-для-бота` | 1 | 2025-07-02 | `de36de7` |
| `codex/изменить-верстку-на-mobile-first` | 1 | 2025-07-03 | `a02879b` |
| `codex/исправить-ошибку-при-деплое` | 1 | 2025-07-03 | `ba54a46` |
| `codex/настроить-auto-deploy-и-маршруты-для-приложения` | 1 | 2025-07-03 | `4358907` |
| `codex/улучшить-uiux-телеграм-бота` | 1 | 2025-07-03 | `35d9b7f` |
| `9irwrz-codex` | 1 | 2025-07-08 | `0985925` |
| `a42ytd-codex` | 1 | 2025-07-08 | `0ead7ab` |
| `codex/-css` | 1 | 2025-07-08 | `9d6de3e` |
| `codex/-enoent-index.html` | 1 | 2025-07-08 | `685628f` |
| `codex/-react` | 1 | 2025-07-08 | `4acdad9` |
| `codex/-react-backend` | 1 | 2025-07-08 | `9fd7ff4` |
| `codex/-telegram` | 1 | 2025-07-08 | `76aa005` |
| `codex/fix-invalid-request-url-error` | 1 | 2025-07-08 | `1753b9b` |
| `du2pcz-codex/fix-missing-environment-variables` | 1 | 2025-07-08 | `0b73757` |
| `z0c5my-codex/-react` | 1 | 2025-07-08 | `c8dfefd` |
| `a1ng3d-codex` | 1 | 2025-07-09 | `b00a43a` |
| `codex/fix-enoent-error-on-file-open` | 1 | 2025-07-10 | `a1e8e9c` |
| `codex/fix-error-handling-for-voice-message` | 1 | 2025-07-10 | `9b240f4` |
| `ed5wol-codex` | 1 | 2025-07-10 | `ef9b40f` |
| `p8cbpf-codex` | 1 | 2025-07-10 | `81162f5` |
| `ruzlh3-codex` | 1 | 2025-07-10 | `c37dc54` |
| `codex/-enoent` | 1 | 2025-07-15 | `46a6c01` |
| `fix/dockerfile` | 1 | 2025-07-15 | `2e2b15c` |

**C. Живые параллельные линии (2) — не удалять:**

| Ветка | Своих коммитов | Последний коммит | Tip SHA | Что это |
|---|---|---|---|---|
| `docs/capture-core-design` | 57 | 2026-08-28 | `c697146` | параллельная линия «capture core»: новый каркас мини-аппа, разошлась с `main` от 2026-08-13 |
| `feat/new-frontend` | 31 | 2026-01-15 | `988f053` | старый фронтенд-эксперимент, январь 2026 |

Tip SHA записаны намеренно: после удаления ветки коммит остаётся достижим по SHA, пока GitHub не соберёт мусор.

---

### FT-051: P1 attention system and input speed

Status: backlog
Priority: medium
Owner: Hermes
Type: product

Context:
P0 бенчмарк-роадмапа (семантика и корректность) закрыт. P1 — скорость ежедневного ввода и система внимания — не начат. Разворачивать имеет смысл после включения, когда есть живой ввод и видно, что реально мешает.

Scope (уточняется перед стартом):
- Шаблоны частых операций
- Правила для merchant → категория
- Карточки «требует внимания» на главной: подозрительный регулярный платёж, категория у границы бюджета, несведённая транзакция, непогашенный долг
- Календарь/месячный вид для разбора
- Список регулярных платежей с напоминаниями

Definition of Done:
- [ ] Разбита на срезы после вехи 1, не раньше

Depends on: FT-044

---

### FT-054: Semantic type in manual transaction form

Status: backlog
Priority: high
Owner: Hermes
Type: product-ux

Context:
Форма новой транзакции содержит тип, сумму, категорию, описание, дату и место. Указать «перевод себе», «вклад», «снятие наличных» невозможно — всё заведённое руками становится `expense`. Семантика доступна только через разбор голоса/текста в боте или постфактум через чипсы в списке.

Ядро продукта отсутствует в его главной форме ввода. При этом MVP-петля требует записи операции за 10 секунд, поэтому просто добавить седьмое обязательное поле нельзя.

Open questions (решить до реализации):
- Отдельное поле или быстрый ряд чипсов под суммой?
- Показывать всегда или только когда категория/описание намекают на не-расход?
- Что по умолчанию: `expense` или «определить автоматически»?

Definition of Done:
- [ ] Решение по вопросам выше зафиксировано здесь
- [ ] Семантический тип задаётся при ручном создании
- [ ] Значение по умолчанию не удлиняет обычный сценарий «трата за 10 секунд»
- [ ] Созданное вручную не-расходное движение исключается из расходов на главной, в бюджетах и аналитике
- [ ] Тест на создание каждого семантического типа через форму

Depends on: FT-052 (иначе созданное вручную не-расходное движение всё равно попадёт в аналитику)

---

### FT-062: Home screen scope and section priority

Status: backlog
Priority: medium
Owner: Hermes
Type: product-ux

Context:
Главная — 2929px, около 3.5 экранов. На ней два конкурирующих объяснения одних и тех же денег: «Чистый поток» и «Почему цифры честные». Там же карточка «Лимиты» с квотами подписки (16/50 транзакций, 0/10 голосовых) — монетизационная механика на самой частой ежедневной поверхности. Страница «Ещё» при этом содержит два пункта и на 80% пуста.

Похоже, приоритеты разделов инвертированы: редкое вынесено на главную, а раздел для редкого пустует. Это продуктовое решение, поэтому задача в backlog до обсуждения.

Scope (уточняется):
- Что остаётся на главной как ежедневный экран
- Куда переезжают лимиты подписки
- Нужны ли два объяснения цифр или достаточно одного
- Чем наполняется «Ещё»

Definition of Done:
- [ ] Решение зафиксировано здесь до реализации

---

### FT-063: Debt due dates and reminders

Status: backlog
Priority: medium
Owner: Hermes
Type: product

Context:
Карточка долга показывает только «Создан: Сегодня». Ни срока, ни напоминания, ни признака просрочки. Person-first долги со сроком и напоминанием стоят третьим пунктом P0 в бенчмарк-роадмапе и остаются несделанными.

Definition of Done:
- [ ] Разбито на срезы после решения по FT-062

---

### FT-069: Premium boundary is incoherent and bypassable

Status: backlog
Priority: low
Owner: Hermes
Type: product

Context:
Две несостыковки в платном контуре:

1. **Гейт обходится.** `GET /dashboard/insights/:userId` и `/health-score`, `/weekly` требуют премиум и отвечают `403 PREMIUM_REQUIRED`. При этом бесплатный `GET /dashboard/:userId` возвращает `financialSummary`, `budgetOverview`, `topCategories`, `monthlyTrends`, `spendingPatterns`, `budgetAlerts`, `insights` — практически те же данные. Mini App использует именно бесплатный маршрут, поэтому платные эндпоинты в интерфейсе не задействованы вовсе.
2. **Разные правила в разных каналах.** Команда `/week` в Telegram премиума не требует, а тот же недельный разбор через API закрыт гейтом.

Недельный разбор объявлен ключевым дифференциатором продукта, поэтому решение, платный он или нет, стоит принять один раз и применить одинаково.

Definition of Done:
- [ ] Решено и записано, что именно относится к премиуму
- [ ] Одно правило для API, Mini App и бота
- [ ] Платные данные недоступны через бесплатные маршруты
- [ ] Если платные эндпоинты остаются неиспользуемыми — удалить или подключить
- [ ] Тест: бесплатный пользователь не получает премиум-данные ни одним путём

---

### FT-071: Rate limits are tight for the intended usage

Status: backlog
Priority: low
Owner: Hermes
Type: product

Context:
Замеры на живом приложении:

- Общий лимит — 100 запросов / 15 минут (`rateLimitMiddleware.ts:21`). Один обход шести экранов Mini App стоит 17 запросов (Главная 4, Аналитика 4, История 3, Долги 3, Бюджеты 2, Ещё 1). То есть около шести обходов на окно, без учёта повторных запросов TanStack Query при возврате фокуса — а в Telegram Mini App сворачивание и разворачивание происходит постоянно.
- Лимит на AI — 10 запросов / 15 минут (`rateLimitMiddleware.ts:57`). Основной способ ввода в продукте — написать или надиктовать боту. Пользователь, заносящий траты за день, упирается в потолок на одиннадцатой операции и получает `AI_RATE_LIMIT_EXCEEDED`.

Оба значения могут быть осознанной защитой от расходов на OpenAI. Задача — не поменять числа, а проверить их против сценария «человек заносит день трат».

Definition of Done:
- [ ] Решение зафиксировано здесь: числа оставляем или меняем и почему
- [ ] Если оставляем — пользователь видит понятное сообщение с моментом, когда лимит отпустит
- [ ] Проверено, что упирание в лимит не выглядит как поломка приложения

---

### FT-144: Daily summary and reminders survive a failed send

Status: backlog
Priority: high
Owner: Claude Code, QA by Hermes
Type: bug
Size: S

Context:
Найдено 2026-10-26 при проверке на маке: итог дня не дошёл ни одного вечера 21–25.10 — каждый раз около 21:05
`getaddrinfo ENOTFOUND api.telegram.org` (`notifications_log`, `status = failed`): мак спал без сети. Итог и напоминания
(FT-124, FT-133) уходят не больше одного раза: перед отправкой пишется строка `notifications_log`
(`dailySummaryNotifier.ts:126-128`, `remindersNotifier.ts:211`), при ошибке она получает `failed`
(`dailySummaryNotifier.ts:141-145`, `remindersNotifier.ts:224-228`) и больше не пробуется — ни в этом процессе
(`handled`, `dailySummaryNotifier.ts:94`; `settled`, `remindersNotifier.ts:212`), ни после перезапуска
(`isClaimed` считает `failed` отправленным, `remindersNotifier.ts:190-196`). Итог «пора» с выбранного времени до
конца дня (`dailySummary.ts:50-53`), но попытка одна — первый тик. У отправителей нет повтора
(`summaryHandlers.ts:16-26`, `reminderHandlers.ts:23-27`).

«Не больше одного раза» — намеренно: повтор после таймаута может прислать сообщение дважды. Но `ENOTFOUND`,
`ECONNREFUSED`, «нет сети» значат, что запрос не ушёл с машины, и повтор безопасен.

Definition of Done:
- [ ] Ошибка, при которой запрос точно не ушёл (DNS, отказ соединения, нет сети), не закрывает отправку: следующий тик пробует снова; тест
- [ ] Таймаут и ответ Telegram с ошибкой по-прежнему закрывают отправку как `failed` — дублей нет; тест
- [ ] Повторы ограничены: до конца дня пользователя или N попыток; в логе видно, какая попытка
- [ ] То же для напоминаний о цели, подписке и ревизии
- [ ] Проверено на своей машине: сеть выключена в момент итога → итог приходит после включения

---

### FT-145: Timeout and retries for OpenAI calls

Status: backlog
Priority: high
Owner: Claude Code, QA by Hermes
Type: bug
Size: S

Context:
`new OpenAI({ apiKey })` создаётся без `timeout` и `maxRetries` (`openAITranscriptionService.ts:29`), у запросов их
тоже нет (`:35-43` голос, `:78-82` текст). Работают умолчания SDK 4.89: таймаут 10 минут и 2 повтора — до 30 минут
ожидания на одну фразу или голосовое, если OpenAI не отвечает. Всё это время бот молчит, а Mini App держит кнопку
серой (FT-146). В `docs/pastel/handoff.md` записано как «фраза с незнакомым словом ждёт таймаута SDK».
`gpt-4.1-mini` обычно отвечает за 1–3 с (замер 2026-10-26).

Definition of Done:
- [ ] Таймаут разбора текста и расшифровки голоса задан явно через `AppConfig`; значение по умолчанию обосновано замером
- [ ] Не больше одного повтора; по истечении — `ExternalServiceError`: бот отвечает «Не получилось разобрать…», простая фраза получает «Другое ?», как сейчас
- [ ] Тест с медленным клиентом: ошибка приходит по таймауту, а не через 10 минут
- [ ] `docs/knowledge-base/07-data-flow/voice-to-transaction.md` описывает таймаут

---

### FT-146: Show progress while a phrase is being parsed

Status: backlog
Priority: medium
Owner: Claude Code, QA by Hermes
Type: quick-action-ui
Size: S

Context:
Замечание Шукура при проверке на телефоне: после отправки фразы кажется, что ничего не происходит. Пользователь
остаётся на главной; поле становится `readOnly`, круглая кнопка — серой (`ComposerView.tsx:127`, `:150-156`), и всё:
ни индикатора, ни текста. Проверка записей `/review` открывается только после ответа сервера
(`useSendCapture.ts:69`, `:86`). С ИИ это 2–5 с, при сбое — до таймаута (FT-145). У запроса нет таймаута и на
клиенте (`mutations.ts:51-56`, `client.ts:85-89`).

Definition of Done:
- [ ] Во время разбора видно, что идёт работа (индикатор в кнопке или строка «Разбираю…» — по холсту; если состояния ожидания на досках нет — согласовать с Шукуром), с `aria-live`
- [ ] Ожидание ограничено на клиенте; по истечении — понятный тост, фраза остаётся в поле
- [ ] Тест компонента: состояние ожидания и выход по таймауту
- [ ] Скриншоты на 390px в светлой и тёмной теме

---

### FT-147: Note field squeezed by the keypad in manual entry

Status: backlog
Priority: medium
Owner: Claude Code, QA by Hermes
Type: quick-action-ui
Size: S

Context:
Замечание Шукура при проверке на телефоне. Экран `/add` — колонка высотой `100dvh` (`ManualEntryView.tsx:95`).
Шапка, сумма, цифровая клавиатура (216px, `keypad.tsx:35-43`) и кнопка «Сохранить» фиксированы — около 485px,
520px с чипом пересчёта. Счёт, категория и заметка делят остаток в прокручиваемой области (`:129`), заметка — внизу
(`:190-201`). На телефоне, особенно когда системная клавиатура уменьшает `dvh`, заметку сжимает или уводит за край.
Цифровая клавиатура при фокусе на заметке не прячется; `visualViewport` нигде в webapp не учитывается.

Definition of Done:
- [ ] Пока заметка в фокусе, она видна целиком над системной клавиатурой (прятать цифровую клавиатуру или вынести заметку из прокрутки — по холсту)
- [ ] На 375×640 и 390×844 все поля доступны без перекрытий; скриншоты
- [ ] Тест: фокус на заметке меняет раскладку

---

### FT-148: Mark records before the account's opening date

Status: backlog
Priority: low
Owner: Claude Code, QA by Hermes
Type: quick-action-ui
Size: S

Context:
Остаток счёта считает записи и переводы с даты открытия (`SqliteAccountRepository.ts:60`, `:65`, `:70`;
`accountBook.ts:81`). Список операций счёта отдаёт и более ранние — с `countsInBalance: false`
(`accountOperations.ts:95`, `:108`, `:124`), но webapp это поле не читает (`entities/account/model/types.ts:76-77`,
`accountScreen.ts:109-123`, `AccountPage.tsx:45-71`). Ранние записи выглядят как обычные, и список не сходится с
остатком.

Definition of Done:
- [ ] Запись до даты открытия на экране счёта отмечена (вид — по холсту), понятно, что она не входит в остаток
- [ ] Тест `accountDays`: флаг доходит до строки
- [ ] Скриншоты в светлой и тёмной теме

---

### FT-149: Choose the default account

Status: backlog
Priority: medium
Owner: Claude Code, QA by Hermes
Type: feature
Size: S

Context:
На backend настройка есть: `default_account_id` (`UserSettings.ts:34-35`), `PATCH /api/settings {defaultAccountId}`
с проверкой, что счёт видимый (`userSettingsUseCases.ts:47-61`, `:124-127`). Новые записи идут на него, иначе на
первый видимый счёт (`accountBook.ts:115-117`). В webapp поле только читается (ручной ввод, чипы, офлайн, отправка
фразы) — выбрать его негде. Сейчас счёт по умолчанию зависит от порядка счетов.

Definition of Done:
- [ ] Место выбора — по холсту; если доски нет — решение Шукура до реализации
- [ ] Выбор вызывает `PATCH /api/settings` и сразу действует в ручном вводе, чипах и фразах; тест
- [ ] Скрытый счёт выбрать нельзя; если скрывают счёт по умолчанию — записи идут на первый видимый, и экран это показывает; тест

---

### FT-150: Bare «яндекс» and «uber» should not mean Transport

Status: backlog
Priority: medium
Owner: Claude Code, QA by Hermes
Type: bug
Size: S

Context:
У старой категории `taxi` синонимы `яндекс`, `yandex`, `uber` (`Category.ts:68`); их забирает стартовая «Транспорт»
(`categoryPresets.ts:26`, `:98-106`). В выученных словах тоже есть `yandex` (`data/patterns.seed.json:16-24`). Быстрый
путь FT-143 ищет категорию по словам подписи (`processTextInput.ts:570-588`, `categoryGuess.ts:72-95`), поэтому
«яндекс плюс 99000» и «uber eats 120000» уходят в «Транспорт» без ИИ, хотя «Яндекс Плюс» — подписка
(`subscriptionCatalog.ts:44-53`). Записано в `docs/pastel/handoff.md`.

Definition of Done:
- [ ] Голые «яндекс», «yandex», «uber» категорию не дают — фраза идёт к ИИ; «яндекс такси», «yandex go», «такси» — «Транспорт» без ИИ
- [ ] «яндекс плюс 99000» и «uber eats 120000» не попадают в «Транспорт»; тесты
- [ ] `patterns.seed.json` не учит голое «yandex» как транспорт

---

### FT-151: Flaky webLogin test

Status: backlog
Priority: low
Owner: Claude Code, QA by Hermes
Type: repo-hygiene
Size: S

Context:
`tests/webLogin.test.ts` один раз упал в полном прогоне `npm run verify` при проверке ветки
`claude/new-session-uv5og7` и прошёл на повторе. Кандидаты:
- каждый `beforeEach` создаёт SQLite и прогоняет все миграции с копией базы (`:87-96`, `tests/helpers/testDatabase.ts:15-28`), а в `jest.config.js` нет `testTimeout` — под нагрузкой хук может не уложиться в 5 с;
- ограничители частоты общие на весь файл и на реальных часах: `strictRateLimiter` — 10 POST за 15 минут на `/api/auth/web-login` (`rateLimitMiddleware.ts:90-112`), в блоке маршрутов уже 8 таких запросов (`:397`…`:514`).

Definition of Done:
- [ ] Причина найдена и записана здесь
- [ ] Ограничители не общие между тестами (сброс или внедрение)
- [ ] 20 полных прогонов `npm run test:ci` подряд без падения этого файла

---

### FT-152: Queue a complex phrase offline and parse it when the connection returns

Status: backlog
Priority: medium
Owner: Claude Code, QA by Hermes
Type: feature
Size: M

Context:
Идея Шукура 2026-10-26 при проверке без сети; детали уточнить перед началом. Сейчас без связи фразу разбирает
телефон простым правилом (FT-129, `offlineText.ts`): каждая часть — «что + одна сумма», категория по первому слову из
короткого списка. Фраза сложнее («обед 60000 яблоки 2 килограмма 50000», без суммы, с датой) не записывается: тост
«Без связи понимаю только «что и сколько»» (`captureNotices.ts`, `useSendCapture.ts:90-93`), текст остаётся в поле,
и после связи его надо отправить заново. Очередь (`shared/lib/offline/outbox.ts`) хранит только готовые записи.

Идея: не отказывать, а класть сырую фразу в очередь и отправлять в `POST /api/quick-capture`, когда связь вернётся, —
разбирает сервер с ИИ, как в боте.

Открытые вопросы (решить с Шукуром до реализации):
- Что видно сразу после ввода без сети: строка «ждёт связи» с текстом фразы на главной, как у записей очереди?
- Что после разбора: проверка записей `/review` при следующем открытии, тост «записал N», сообщение в чат бота?
- Простая фраза по-прежнему пишется сразу на устройстве или всё идёт через сервер?
- Как отменить или поправить фразу, пока она ждёт; что делать, если ИИ не разобрал её после связи
- Повтор отправки без дублей: `client_id` у фразы, как у записей очереди (FT-129)
- Доска холста для этого состояния есть или нужна новая

Definition of Done:
- [ ] Ответы на открытые вопросы записаны здесь и в `docs/tasks/decisions.md`
- [ ] Фраза, которую телефон не разобрал без сети, не теряется и сама уходит на сервер после связи; тест очереди
- [ ] Повторная отправка не создаёт дублей; тест
- [ ] Проверено на телефоне: авиарежим → сложная фраза → связь → записи появились

---
