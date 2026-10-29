# Архив задач — ежедневное пользование и переезд на ПК

Задачи с FT-144: надёжность, закрытый доступ, переезд живого экземпляра на ПК.

Закрыто задач: **11**. Это архив: задачи здесь не переоткрываются и не редактируются.
Активная доска — [`TASKS.md`](../../../TASKS.md), решения по плану — [`decisions.md`](../decisions.md).

---

### FT-158: Remove the dead SSH deploy to AWS

Status: done
Priority: low
Owner: Claude Code, QA — под-чат проверки
Type: repo-hygiene
Size: S

Context:
Джоб `deploy` в `.github/workflows/deploy.yml` ходит по SSH на старый AWS-хост (выведен из планов 2026-08-13) и
запускается только вручную. `docker-cleanup.yml` ходит на тот же хост по расписанию; GitHub отключил его за
неактивность, последний прогон — 2026-03-29. Живой экземпляр теперь обновляется командой на ПК (FT-156), этот путь
не вернётся. `quality-gate` в том же файле — единственная проверка на push в `main`, и она остаётся.

Definition of Done:
- [x] Из `deploy.yml` убран джоб `deploy`; `quality-gate` остаётся и берёт Node из `.nvmrc`, а не 20; файл переименован, если имя больше не отражает суть
- [x] `docker-cleanup.yml` удалён
- [ ] Шукур сам удаляет секреты `SSH_HOST`, `SSH_USER`, `SSH_KEY` в настройках репозитория — внешнее действие Шукура, после PR их ничто не читает
- [x] `Dockerfile` и `docker-compose.yml` не трогаются: Docker сейчас не используется, но удалять их — отдельное решение
- [x] Обновлены места, где деплой описан как законсервированный (`CLAUDE.md`, `docs/knowledge-base/08-development/`)

Реализовано 2026-10-27 (`bba33f7`, PR #97):
- `deploy.yml` → `quality-gate.yml`, имя «Quality gate»: деплоя в файле больше нет, а имя совпадает с id джоба, который
  уже знают документы. Id `quality-gate` не менялся. Джоб берёт Node из `.nvmrc`; шаги — как в `verify.yml`
  (`permissions: contents: read`, `timeout-minutes: 20`, кэш npm для обоих lockfile).
- `docker-cleanup.yml` удалён.
- README и `DEPLOYMENT.md` (разделы «GitHub Actions», вводная `DEPLOYMENT.md`) описывают `verify.yml` и
  `quality-gate.yml` и говорят, что деплоя нет. Из `08-development/troubleshooting.md` убран раздел «SSH
  Authentication Failed (GitHub Actions)» и его строка в сводной таблице.
- `CLAUDE.md` не менялся: SSH-деплоя в нём нет, а «Production/AWS is intentionally parked» — решение 2026-08-13.
- `quality-gate` повторяет `verify.yml`, отличается только триггером (push в `main` против `pull_request`). Слить их —
  `push: branches: [main]` в `verify.yml` и удалить `quality-gate.yml`; по DoD файл оставлен.

Проверка 2026-10-27:
- DoD сверен по пунктам. `gh pr diff 97`: `jobs` в `quality-gate.yml` совпадает с `verify.yml` целиком,
  `permissions: contents: read`, `timeout-minutes: 20`; `concurrency` намеренно не перенесён — на `main` проверяется
  каждый коммит.
- Ссылок на удалённые файлы нет (README, `DEPLOYMENT.md`, `package.json`, `scripts/`, `.github`). `main` не защищён —
  смена имени workflow ничего не ломает.
- Синтаксис трёх workflow — js-yaml (`actionlint` и `act` не установлены).
- `npm run verify` в копии проверки: Jest 84/1276, Vitest 122/1199, dependency-cruiser 323 модуля без нарушений, madge
  без циклов. `gh pr checks 97` — `verify` зелёный за 8m1s.
- Первый прогон «Quality gate» на `main` штаб проверит после мержа.
- Мелочи на потом: раздел «Git Pull Fails on Server» в `troubleshooting.md` (решить в FT-156), устаревшее про
  `synchronize` в `DEPLOYMENT.md:72`.

---

### FT-153: Closed access by ALLOWED_TELEGRAM_IDS

Status: done
Priority: high
Owner: Claude Code, QA — под-чат проверки
Type: security
Size: S

Context:
Решение 2026-10-26 (живой экземпляр на своём ПК). Tailscale закрывает API и Mini App, но не бота: бот получает
сообщения через Telegram, любой нашедший его пишет и шлёт голосовые, а лимиты free выключены (Д3) — разбор идёт за
ключ OpenAI Шукура. Списка допущенных нет, есть только `ADMIN_TELEGRAM_IDS` для админ-маршрутов (`requireAdmin`,
`authMiddleware.ts:419`). Вход в API — `signedInTelegramId()` и `requireAuth` (`authMiddleware.ts:170`, `:214`); бот —
цепочка `bot.use` (`telegramBot.ts:142-200`); получатели итогов дня и напоминаний — все пользователи базы
(`notificationModule.ts:75`, `:88`), а в базе есть и тестовые.

Definition of Done:
- [x] `ALLOWED_TELEGRAM_IDS` (Telegram id через запятую) в `AppConfig`; при `NODE_ENV=production` пустой список — ошибка старта (fail-closed), вне production пустой список пускает всех, как сейчас
- [x] Бот: сообщение или нажатие не-допущенного не создаёт пользователя, не вызывает OpenAI и не пишет в базу; бот молчит, в логе `warn` с Telegram id, чтобы было видно, кого отсекли; тест
- [x] API: initData или cookie входа не-допущенного — 403 до `resolveUser`, строка в `users` не появляется; тест
- [x] Вход в браузере через бота (FT-128) не-допущенному не выдаётся; тест
- [x] Итоги дня и напоминания уходят только допущенным; тест
- [x] Переменная описана в `.env.example`, `CLAUDE.md` и `docs/knowledge-base/08-development/quick-start.md`

Реализовано 2026-10-27 (`be0107e`, `888e034`, PR #99):
- Список — `src/shared/domain/access/telegramAccess.ts`: `parseTelegramIds` и `telegramAccess(ids)` с `allows(id)`;
  пустой список пускает всех. `AppConfig.ALLOWED_TELEGRAM_IDS` и `TELEGRAM_ACCESS`; `validate()`: пустой список при
  `NODE_ENV=production` — ошибка старта; запись не из положительного целого — ошибка старта везде, с названием записи
  (опечатка, пропущенная молча, заперла бы владельца или оставила пустой список, открытый всем). Запятые, пробелы
  вокруг и пустые элементы — можно, ведущие нули — тот же id.
- Бот: `allowedUsersOnly` — первый `bot.use`, до сессии и `getOrCreate`. Не-допущенный: нет пользователя, нет OpenAI,
  ничего не пишется, бот молчит, `warn` с Telegram id и типом апдейта. Апдейт без отправителя при заданном списке
  отбрасывается.
- API: `createAllowedUsersMiddleware()` в `buildServer` сразу после сессии браузера, до всех роутеров, лимитеров и
  `resolveUser`: initData, cookie сессии или `X-Dev-User-Id` не-допущенного — `403 ACCESS_NOT_ALLOWED`. Запрос без входа
  идёт к маршруту (там `401`).
- `X-Dev-User-Id` под списком, как любой вход; не из цифр — тоже `403` (`requireAuth` впустил бы его как `NaN`).
- `X-Shortcut-User-Id` вне production: владелец не из списка — `403`, проверка после токена, чтобы ответ на неверный
  токен не выдавал, кто в списке. В production путь по-прежнему `403 SHORTCUT_CAPTURE_DISABLED` — это FT-155.
- Вход в браузере: бот не отвечает на `/start login_…` и кнопки не-допущенного; `OpenWebSessionUseCase` вдобавок не
  превращает в сессию вход, подтверждённый до смены списка (`POST /api/auth/session` — `403`, строки в `users` нет);
  сессия, выданная до смены, получает `403` от middleware.
- Итоги дня и напоминания: `NotificationModule` берёт получателей только из списка — по умолчанию из `AppConfig`, так
  что модуль, собранный без списка, не откроет рассылку всем. Остальные строки `users` (тестовые) не трогаются.
- Тесты не зависят от `.env.local`: `tests/setup/env.ts` (jest `setupFiles`) обнуляет `ALLOWED_TELEGRAM_IDS` — без
  этого список из `.env.local` или общего `dev.env` ронял 6 тестов Shortcut.
- Тесты: `tests/allowedTelegramIds.test.ts` (список, `AppConfig`, API через настоящий `buildServer`, сессия, Shortcut),
  `tests/telegramAllowedUsers.test.ts` (настоящий бот из `startTelegramBot` на настоящем Telegraf, поддельны только
  polling и Bot API), случаи FT-153 в `dailySummary.test.ts` и `botReminders.test.ts`.
- Документы: `.env.example`, `CLAUDE.md`, `quick-start.md`, `07-data-flow/api-lifecycle.md` (D3),
  `01-architecture/auth-user-resolution-boundary-matrix.md`.

Проверка 2026-10-27:
- Под-чат проверки: DoD сверен по пунктам. Обходы: `allowedUsersOnly` — первый `bot.use`; `ctx.from` есть у всех
  типов апдейтов telegraf 4.16.3, кроме `channel_post`, `poll`, `business_message` — они отбрасываются; API-гейт
  (`expressServer.ts:88`) стоит до всех `resolveUser` и лимитеров. Разбор списка: пробелы, пустые, дубли — ок; 0,
  отрицательные, `1e5`, `;` — ошибка старта.
- `npm run verify`: Jest 86/1305, Vitest 122/1199, dependency-cruiser 0, madge 0; CI `verify` зелёный.
- Живой API (порт 3100, список 900000143): допущенный — 200; `222`, `abc` — 403 `ACCESS_NOT_ALLOWED`; без входа — 401.
  Подписанная initData чужого 333 — 403 на `/api/settings`, `/api/auth/session`, `/api/quick-capture`,
  `/api/voice/process-text`; своего — 200; подделанная — 401. Shortcut на чужого — 403. Вход через бота:
  подтверждённый логин 222 → 403 без cookie, 900000143 → 201. В production без списка — выход с кодом 1; с
  `X-Dev-User-Id` — 401. В `users` не появились 222 и 333.
- Штаб, бот вживую (Telegram Web, @FinanceTrackerDevBot, копия ветки на порту 3200, живой экземпляр остановлен
  14:36–15:06): со списком без Шукура «кофе 25000», `/start` и «Изменить» на старой записи — бот молчит, в логе
  `warn … not allowed ignored {"telegramId":131184740,"updateType":"message"|"callback_query"}`, в базе копии ни
  пользователя, ни записи. С Шукуром в списке «кофе 25000» → «Расход −25 000 сум · Кафе · «Кофе»»; итог дня
  допущенному пришёл (проверка FT-144 на той же копии).
- Найдено вне DoD: допущенный пользователь с чужим id в пути (`/api/transactions/user/444`) получает 403, но строка
  `users` для 444 создаётся — давнее, это FT-162. Мелочи: отказ `POST /api/auth/session` пишет в лог `error` без id;
  два формата тела `ACCESS_NOT_ALLOWED` (middleware и контроллер); `docs/QUICK_CAPTURE_API.md` не знает
  `403 ACCESS_NOT_ALLOWED` (поправит FT-155); `warn` на каждый отказ без ограничения — отдельная задача в backlog.

---

### FT-144: Daily summary and reminders survive a failed send

Status: done
Priority: high
Owner: Claude Code, QA — под-чат проверки
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
- [x] Ошибка, при которой запрос точно не ушёл (DNS, отказ соединения, нет сети), не закрывает отправку: следующий тик пробует снова; тест
- [x] Таймаут и ответ Telegram с ошибкой по-прежнему закрывают отправку как `failed` — дублей нет; тест
- [x] Повторы ограничены: до конца дня пользователя или N попыток; в логе видно, какая попытка
- [x] То же для напоминаний о цели, подписке и ревизии
- [x] Проверено на своей машине: сеть выключена в момент итога → итог приходит после включения

Реализовано 2026-10-26 (PR #91, коммит `e915f44`):

- Отправители бота (`summarySender`, `reminderSender`) превращают `ENOTFOUND`, `EAI_AGAIN` и `ECONNREFUSED` — ошибки до
  соединения, когда запрос точно не ушёл, — в доменную `NoticeNotSentError` (`utils/notSent.ts`).
- Нотификатор на этой ошибке освобождает заявку (`release` удаляет только свою строку в статусе `sending`) и не помечает
  уведомление обработанным: следующий тик пробует снова. Итог — до конца дня пользователя, напоминание — пока его
  период «пора»; в логе номер попытки и настоящая причина.
- «Не больше одного раза» сохранено: таймаут, `ECONNRESET` и ответ Telegram с ошибкой остаются `failed` — запрос мог дойти.
  Если освободить заявку не удалось — `failed`, а не повтор.

Проверка 2026-10-27:

- Под-чат проверки: пути к дублю нет — `release` трогает только свою строку `sending`, тики не перекрываются, после
  перезапуска строка `sending` остаётся занятой. Код ошибки node-fetch Telegraf пробрасывает как есть
  (`FetchError.code`); `TelegramError.code` — число, таймаут Telegraf — `FetchError` без кода: оба остаются `failed`.
  `npm run verify`: Jest 84/1276, Vitest 122/1199, сборки, dependency-cruiser и madge чистые.
- Живая база, только чтение: вечером 26.10 итог 12 раз не ушёл (`attempt 1…12`, `ENOTFOUND`; мак 12 раз просыпался на
  2–13 с между 21:08 и 23:53), после полуночи пропал без строки в `notifications_log` — так задумано (тест
  `dailySummary.test.ts:425`), след пропущенного уведомления — FT-164.
- Бот вживую (штаб, Telegram Web, @FinanceTrackerDevBot, своя копия на порту 3200, живой экземпляр остановлен
  14:36–15:06): в процессе бота preload-скрипт глушил `api.telegram.org` (подмена `dns.lookup` и закрытие свободных
  keep-alive-сокетов, пока есть файл-флаг) — как мак, проснувшийся без сети. Пояс пользователя `Asia/Vladivostok`,
  итог в 20:00 → «пора» в 10:00 UTC. 10:00 и 10:01 UTC — `Daily summary did not leave, trying again next minute
  {attempt: 1|2, error: … getaddrinfo ENOTFOUND api.telegram.org}`, строки в `notifications_log` нет; флаг снят в
  10:02:26 → в 10:02:38 строка `sent`, `message_id` 208, в чате «Итоги дня · 27 октября. Потрачено 25 000 сум · 1 запись».
- Оговорки, вынесенные в задачи: строки планировщиков без времени и уровня, удачная попытка в лог не пишется — FT-165;
  счётчик попыток в памяти, а подписка и ревизия 1-го числа после конца окна пропадают без `failed` — FT-164.

---

### FT-145: Timeout and retries for OpenAI calls

Status: done
Priority: high
Owner: Claude Code, QA — под-чат проверки
Type: bug
Size: S

Context:
`new OpenAI({ apiKey })` создаётся без `timeout` и `maxRetries` (`openAITranscriptionService.ts:29`), у запросов их
тоже нет (`:35-43` голос, `:78-82` текст). Работают умолчания SDK 4.89: таймаут 10 минут и 2 повтора — до 30 минут
ожидания на одну фразу или голосовое, если OpenAI не отвечает. Всё это время бот молчит, а Mini App держит кнопку
серой (FT-146). В `docs/pastel/handoff.md` записано как «фраза с незнакомым словом ждёт таймаута SDK».
`gpt-4.1-mini` обычно отвечает за 1–3 с (замер 2026-10-26).

Definition of Done:
- [x] Таймаут разбора текста и расшифровки голоса задан явно через `AppConfig`; значение по умолчанию обосновано замером
- [x] Не больше одного повтора; по истечении — `ExternalServiceError`: бот отвечает «Не получилось разобрать…», простая фраза получает «Другое ?», как сейчас
- [x] Тест с медленным клиентом: ошибка приходит по таймауту, а не через 10 минут
- [x] `docs/knowledge-base/07-data-flow/voice-to-transaction.md` описывает таймаут

Реализовано 2026-10-26 (PR #91, коммит `f554a87`):

- `OPENAI_TIMEOUT_MS` (20 000 мс, текст и голос) и `OPENAI_MAX_RETRIES` (1, 0–5, только текст) в `AppConfig`; мусор и
  значения вне диапазона заменяются умолчаниями, верхняя граница таймаута — предел `setTimeout`. Без них работали
  умолчания SDK — 10 минут и 2 повтора, до 30 минут молчания.
- Голос не повторяется: SDK собирает multipart-тело один раз, повтор отправил бы уже прочитанный поток.
- По таймауту бот отвечает «Не получилось разобрать… не записал», простая фраза получает «Другое ?», в логе —
  `Request timed out.`. Описано в `voice-to-transaction.md`.

Проверка 2026-10-27:

- Под-чат проверки: все 4 пункта DoD — тесты `openAITimeout.test.ts` (медленный `fetch`: текст — 2 вызова, голос — 1;
  разбор env с мусором и границами). `npm run verify` — как у FT-144.
- API вживую (порт 3100, бот выключен): `OPENAI_TIMEOUT_MS=1` — «стрижка 50000» → 200, «Стрижка · 50 000 сум · Другое?»
  за 0,54 с (две попытки и пауза SDK — повтор ровно один); «ужин 90к и такси 20к» → 502 `EXTERNAL_SERVICE_ERROR` с
  `"Request timed out."` за 0,40 с. Обычный режим: «ужин 90к и такси 20к» → две записи, Кафе и Транспорт, 2,3 с.
- Бот вживую (штаб, та же копия): `OPENAI_TIMEOUT_MS=1` — «ужин 90к и такси 20к» → через секунду «Не получилось
  разобрать — сервис распознавания сейчас не ответил, поэтому не записал», в логе `Text message error
  {"errorContext":{"originalError":"Request timed out."}}`; в обычном режиме «кофе 25000» → «Расход −25 000 сум · Кафе».
- Мелочи — в FT-165: на пути простой фразы в лог не попадает причина сбоя; неверный пример «такси 18000» в
  `voice-to-transaction.md:307`.

---

### FT-154: The bot does not die silently

Status: done
Priority: high
Owner: Claude Code, QA — под-чат проверки
Type: reliability
Size: S
Depends on: FT-153 (те же файлы: `AppConfig`, `telegramBot.ts`)

Context:
Если long polling падает насовсем (409 после всех повторов, неверный токен, другая ошибка Telegram), приложение
продолжает жить без бота (`telegramBot.ts:275-279`, `:304`), а `/api/health` всегда отвечает 200: состояние бота есть
только в теле, в поле `telegramBot` (`expressServer.ts:91-99`). На маке это было видно глазами. На ПК под systemd
(FT-156) никто не узнает, что бот молчит: `Restart=always` срабатывает только на выход процесса. Сетевые сбои и
ответы 429 и 5xx Telegraf повторяет сам (`telegraf/lib/core/network/polling.js`), до `failed` они не доходят.

Definition of Done:
- [x] При `NODE_ENV=production` окончательный сбой polling (`state = failed`) останавливает планировщики, закрывает базу и завершает процесс с ненулевым кодом; тест
- [x] `/api/health` отвечает 503, когда бот в состоянии `failed`; `starting` и `retrying` (409, пока мак ещё опрашивает тот же токен) — 200; тест
- [x] Вне production поведение прежнее: разработка без бота работает
- [x] Правило описано в `docs/knowledge-base/01-architecture/runtime-process-mode.md`

Реализовано 2026-10-27 (`93f4413`, PR #101):
- Политика выхода — `src/delivery/runtime/botFailurePolicy.ts`: при `NODE_ENV=production` бот в `failed` пишет причину
  в лог и запускает общее завершение с кодом 1, systemd поднимает процесс; вне production приложение работает без
  бота, как раньше. Бот сообщает о сбое через `startTelegramBot(..., { onPollingFailed })`; ошибка при сборке бота
  тоже даёт `failed`, а не тихое `disabled`.
- Единый выход — `src/delivery/runtime/gracefulShutdown.ts`, и для SIGTERM/SIGINT (код 0): планировщики → HTTP-сервер
  (открытым запросам 5 с, потом обрыв) → база → выход. Упавший шаг — в лог, следующий выполняется; через 10 с выход
  с тем же кодом; повторный вызов не меняет код.
- 409 остаётся `retrying` (health 200), пока не исчерпаны `TELEGRAM_POLLING_MAX_RETRIES` запусков (5, паузы 5→40 с,
  ~75 с). Обе настройки читаются через `AppConfig` (`intFromEnv`): опечатка даёт умолчание, а не NaN и `failed` на
  первом 409.
- `GET /api/health` — 503 `"unhealthy"` при `failed` во всех окружениях, иначе 200 (`healthRoutes.ts`). Webapp
  `serverAnswers()` берёт `answeredByServer`: собственный JSON-503 сервера — «отвечает», HTML-страница шлюза — нет.
- Обработчик сигнала бота перехватывает «Bot is not running!» (опрос не начался — раньше исключение роняло процесс
  мимо завершения) и отменяет отложенный перезапуск после 409 (`stopping`, `retryTimer`).
- Тесты: `gracefulShutdown.test.ts`, `botFailurePolicy.test.ts`, `healthRoute.test.ts`, случаи FT-154 в
  `telegramBot.test.ts`, `webapp/src/shared/api/client.test.ts`. Документы: `runtime-process-mode.md` (Update FT-154,
  рекомендации для юнита FT-156), `troubleshooting.md`, `CLAUDE.md`.

Проверка 2026-10-27:
- Под-чат проверки: DoD сверен по пунктам. Diff: порядок шагов, таймаут 10 с, повторный вызов не меняет код, гонки
  отложенного перезапуска (`stopping`, `retryTimer`), `intFromEnv`, `serverAnswers` (HTML 502/503 шлюза — «не
  отвечает»). Потребители `/api/health`: webapp (поправлен), `dev-miniapp.js` код не читает, Dockerfile `HEALTHCHECK`
  (Docker не используется), README и FT-156 смотрят тело — 503 оставлен во всех окружениях.
- `npm run verify`: Jest 1332/1332, Vitest 1201/1201, dependency-cruiser 328 модулей без нарушений, madge без циклов;
  CI `verify` зелёный.
- Запуски с фальшивым токеном: development — health 503 `failed` `401: Unauthorized`, API 200, SIGTERM → «Shutdown
  complete», код 0; production — выход с кодом 1 через ~0,4 с, строки «polling failed permanently» → «down for good» →
  «Shutting down» → «database connection closed» → «Shutdown complete»; `ENABLE_TELEGRAM_POLLING=false` — 200
  `disabled`; SIGTERM при недосланном запросе — запрос оборван через 5 с, код 0.
- Штаб, настоящий токен (@FinanceTrackerDevBot, живой экземпляр остановлен 16:05–16:12): A (development) — 200
  `running`; SIGTERM во время опроса → «SIGTERM received, stopping bot...», «Shutdown complete», код 0, без «Bot is not
  running!»; `/today`, отправленный, пока никто не опрашивал, обработала следующая копия — offset не потерян. Две копии
  на одном токене (A development, B production): обе при 409 отвечали 200 `retrying` и чередовались; A после 5 попыток
  — 503 `failed`, процесс жив; B на следующем 409 сверх лимита сама вышла с кодом 1, в логе
  `lastError: 409: Conflict: terminated by other getUpdates request` и полная цепочка до «Shutdown complete».
- Найдено вне DoD — в FT-167: остановка не ждёт обработчики бота (база закрывается посреди обработки, возможен дубль
  после перезапуска); счётчик попыток polling не сбрасывается после удачного запуска; в production пустой
  `TG_BOT_API_KEY` даёт `disabled` и health 200.

---

### FT-155: Owner-bound capture token for the iPhone in production

Status: done
Priority: high
Owner: Claude Code, QA — под-чат проверки
Type: security
Size: S
Depends on: FT-153, FT-154 (те же файлы; владелец должен входить в `ALLOWED_TELEGRAM_IDS`)

Context:
Решение 2026-10-26 закрывает вопрос о продовой авторизации Shortcut, отложенный 2026-09-04 (FT-075): быстрая запись
с iPhone (Shortcut на Action Button — FT-160, потом iOS-приложение — FT-161) работает на живом экземпляре с
`NODE_ENV=production`. Сейчас `allowShortcutCapture` в production отвечает 403 `SHORTCUT_CAPTURE_DISABLED`
(`authMiddleware.ts:486-505`), а владельца записи выбирает заголовок `X-Shortcut-User-Id`: держатель токена пишет за
кого угодно (матрица авторизации, раздел 2026-10-21, «Known and left»).

Definition of Done:
- [x] Новая `SHORTCUT_CAPTURE_OWNER` (Telegram id) — владелец записей по токену; `X-Shortcut-User-Id` необязателен, а если есть и не равен владельцу — 403; тест
- [x] В production путь работает, только если заданы токен не короче 32 символов и владелец, и владелец входит в `ALLOWED_TELEGRAM_IDS` (FT-153); иначе 403, как сейчас; тест
- [x] Неверный или пустой токен — 401 `INVALID_SHORTCUT_TOKEN`, сравнение по-прежнему за постоянное время; тест
- [x] Повтор с тем же `clientId` не создаёт дублей; тест
- [x] Заголовки разработчика (`X-Dev-User-Id`) в production по-прежнему не действуют; тест
- [x] Описан отзыв токена: новое значение в `.env.local` и перезапуск сервиса
- [x] Обновлены `docs/QUICK_CAPTURE_API.md`, `docs/IOS_SHORTCUT_ACTION_BUTTON.md`, `.env.example` и `docs/knowledge-base/01-architecture/auth-user-resolution-boundary-matrix.md`; пометка «только dev/test» снята

Реализовано 2026-10-27 (`ec9897a`, `2fe8508`, `15117f7`, PR #103):
- Правила — одна чистая функция `shortcutCaptureAccess()` (`src/shared/domain/access/shortcutCaptureAccess.ts`): её
  вызывают и `allowShortcutCapture` (на каждый запрос), и `AppConfig.validate()` (на старте). Владелец —
  `SHORTCUT_CAPTURE_OWNER`; `X-Shortcut-User-Id` необязателен, чужой или не id — `403 ACCESS_DENIED`; `userId` и
  `source` тела перезаписываются владельцем и `ios_shortcut`. Запрос Shortcut — и с одним `X-Shortcut-Capture-Token`
  (даже пустым).
- Неполная или неверная настройка в production — ошибка старта, как пустой список в FT-153: токен короче 32 символов,
  одна переменная без другой, владелец не id или не из `ALLOWED_TELEGRAM_IDS`. Ошибка видна при перезапуске, а не
  потом как 403 на телефоне. Ни одной — Shortcut выключен, старт идёт, путь отвечает `403 SHORTCUT_CAPTURE_DISABLED`;
  на уровне запроса неверная настройка тоже даёт 403. Ни токен, ни значение владельца, не похожее на id, в ошибку не
  попадают (по проверке — только длина).
- Токен проверяется первым, за постоянное время: нет, пустой или неверный — `401 INVALID_SHORTCUT_TOKEN`; ответ на
  неверный токен ничего не говорит о владельце и списке.
- id сравниваются числом, как в списке: `telegramIdOf()` в `telegramAccess.ts`, её же использует `parseTelegramIds`;
  `0900000143` — это `900000143` (раньше 403).
- Токен побеждает вход Telegram: запрос с токеном пишет владельцу, что бы ни пришло в initData, `X-Dev-User-Id` или
  теле. `X-Dev-User-Id` в production не действует; `req.telegramUser` для Shortcut не выдумывается.
- Вне production прежние правила: без владельца его называет заголовок; без токена — только запрос с этой машины
  (`SHORTCUT_CAPTURE_TOKEN_REQUIRED`); новый `403 SHORTCUT_OWNER_REQUIRED` — нет ни владельца, ни заголовка.
- Отдельного лимита для Shortcut нет — общий `aiRateLimiter`, 20 запросов за 15 минут по IP, вместе с `/api/voice/*`;
  стоит до авторизации и ограничивает и перебор токена.
- Отзыв: новый `SHORTCUT_CAPTURE_TOKEN` в `.env.local` и перезапуск.
- Тесты: `tests/shortcutCaptureOwner.test.ts` (правила, старт, `POST /api/quick-capture` через настоящий
  `buildServer` и `QuickCaptureService` на SQLite в production), случаи FT-155 в `localDevAuth.test.ts` и
  `allowedTelegramIds.test.ts`; `tests/helpers/appConfigWith.ts`; `tests/setup/env.ts` обнуляет обе переменные.
- Документы: `QUICK_CAPTURE_API.md` (раздел Shortcut, ошибки с `ACCESS_NOT_ALLOWED`), `IOS_SHORTCUT_ACTION_BUTTON.md`
  (вариант D для живого экземпляра, отзыв, не делиться командой с токеном, чек-лист D1–D10), `.env.example`, матрица
  авторизации, `api-lifecycle.md`, `quick-start.md`, `CLAUDE.md`. Пометки «только dev/test» сняты.

Проверка 2026-10-27:
- Под-чат проверки: DoD сверен по пунктам. Обходы: `userId` в теле, `?userId=`, `X-Dev-User-Id` + токен, initData
  другого + токен — запись владельцу; части токена и токен в query — 401; токена нет в логах и ответах.
  `telegramIdOf` и `parseTelegramIds` не ослабили FT-153. `SHORTCUT_OWNER_REQUIRED` старые клиенты не шлют.
- `npm run test:ci` 90/90 наборов, 1359/1359 тестов; CI `verify` зелёный.
- Живой запуск. P1 (production, 19 запросов): только токен → 200 владельцу; чужой заголовок → 403; токен + «x»,
  первые 32 символа, пустой → 401; повтор `clientId` → `repeated: true`; «кофе 25к и такси 18к» через OpenAI → 2
  записи. P2: initData другого разрешённого + токен → владельцу. P0: не настроен → 403 `SHORTCUT_CAPTURE_DISABLED`.
  P3: токен из 32 символов — старт, из 31 — нет. Шесть ошибок старта — код 1, токена в выводе нет. Вне production —
  прежнее поведение.
- Оставлено: проверяется только длина токена, не случайность — генерировать `openssl rand -hex 32`; теневой
  пользователь (строка `users` с `telegram_id` = UUID владельца) при первой записи — давняя проблема, не FT-155.

---

### FT-156: Live instance on the Windows PC (WSL)

Status: done
Priority: high
Owner: Claude Code (скрипты, документы) + Shukur (машина), QA — под-чат проверки
Type: infra
Size: M
Depends on: FT-153, FT-154, FT-155 — для переезда; скрипты и документы можно готовить раньше

Context:
Решение 2026-10-26. Сейчас Daftar живёт в `npm run dev:miniapp` на маке: у Cloudflare quick tunnel новый адрес при
каждом запуске, бот молчит, пока мак спит. Нужен живой экземпляр на ПК с Windows + WSL, который включён «как
получится», сам поднимается после включения ПК и открывается с телефона по постоянному адресу в tailnet.
`dev:miniapp` остаётся для разработки на маке.

Definition of Done:
- [x] Отдельная копия `~/daftar-live` на `main` со своей `data/` и `.env.local` (`NODE_ENV=production`, `TZ=Asia/Tashkent` — старый код бюджетов, дашборда и лимитов берёт часы машины); разработка идёт в другой папке или на маке
- [x] Шаблон unit-файла systemd в репозитории: `node dist/index.js`, `Restart=always`, логи в journald; в WSL включён `systemd=true`
- [x] Задача Планировщика Windows при старте системы держит WSL запущенным; инструкция с командами
- [x] Сон Windows при питании от сети выключен; Tailscale на Windows работает как служба и без входа пользователя
- [x] `tailscale serve --bg` отдаёт `http://localhost:3000` как `https://<пк>.<tailnet>.ts.net`; этот адрес — в `WEB_APP_URL`; кнопка меню ставится один раз (`npm run miniapp:menu -- set`)
- [x] Одна команда обновления (скрипт или npm-скрипт): `git pull --ff-only` ветки `main`, `npm ci`, сборки webapp и backend, перезапуск сервиса; описан откат — прошлый коммит и копия из `data/backups/`
- [ ] Проверено: Windows перезагружена без входа в WSL → бот отвечает, Mini App открывается с iPhone по адресу tailnet — перенесено в FT-159: нужен ПК Шукура и переезд
- [x] Новый документ `docs/knowledge-base/08-development/live-instance.md`; `CLAUDE.md` (Runtime target), `quick-start.md` и «Постоянный контекст» в `TASKS.md` описывают живой экземпляр вместо quick tunnel

Реализовано 2026-10-27 (`38006b7`, `5ed824e`, `f54a6e0`, `66f777a`, `25430a4` и правки ревью, PR #102):
- Копия `~/daftar-live` на `main` со своей `data/` и `.env.local`; шаблон без значений — `ops/live/env.local.example`
  (`NODE_ENV=production`, `TZ=Asia/Tashkent`, `ALLOWED_TELEGRAM_IDS`, `WEB_APP_URL` — адрес tailnet, блок Shortcut
  FT-155: обе переменные или ни одной).
- Unit `ops/live/daftar.service`: `node dist/index.js` через `scripts/nvm-exec.sh` — сервис и `npm ci` на одном Node
  из `.nvmrc`, нативный `sqlite3` совпадает; обёртка делает `exec`, SIGTERM получает node. `NODE_ENV=production`
  закреплён в unit; `After=network.target` — ожидание сети в WSL держало бы старт минутами.
- Политика перезапуска: `Restart=always`, пауза 10 с → 10 минут (`RestartSteps=6`, `RestartMaxDelaySec=10min`,
  systemd 254+), `StartLimitBurst=20` за час — страховка для systemd 249. После FT-154 неверный токен, 409 или нет
  сети на старте — несколько попыток в час, сервис возвращается сам; счётчик сбрасывают ручной старт и
  `reset-failed` (`service.c`).
- `tailscale serve --bg http://127.0.0.1:3000` — в Windows: Tailscale советует клиент только в Windows (KB 1295),
  порт из WSL 2 виден в Windows на `localhost`; запасной путь — `networkingMode=mirrored`.
- Задача Планировщика `Daftar WSL`: при старте системы и при входе, от учётки Шукура с паролем, `wsl.exe --exec
  /bin/sleep infinity`, без лимита времени; раздел «Если задача не работает» — коды `LastTaskResult`, пароль и
  Windows Hello, запасной `instanceIdleTimeout=-1`.
- `scripts/live-update.sh`: отказ не на `main`, на грязном дереве, без `.env.local`, со своими коммитами; `sudo -v`
  сразу; `git pull --ff-only`; проверка Node из `.nvmrc`; `npm ci` (webapp — его `postinstall`, проверяется) и сборка
  сервера; `reset-failed` + `restart`; health до 60 с; только после 200 — локальный тег `live-good`, на него
  указывают все сообщения и откат (`git switch --detach live-good`, база — `migration:revert` или `backupPath`).
- Бот на ПК выключен до переезда: шаблон ставит `ENABLE_TELEGRAM_POLLING=false` и пустой токен, health до переезда —
  `disabled`; раздел «Переезд» — порядок включения. ПК остаётся на @FinanceTrackerDevBot, маку — новый dev-бот в FT-159.
- Документ `docs/knowledge-base/08-development/live-instance.md` (установка по шагам, проверка, переезд, обновление,
  откат, логи, адрес клиента и лимиты, место для бэкапа FT-157 с правилом «живую базу в облачную папку не класть»);
  `troubleshooting.md` — раздел «Live Instance on the PC» вместо AWS; `CLAUDE.md`, `quick-start.md`, `DEPLOYMENT.md`,
  индекс knowledge-base, «Постоянный контекст»; `downloads/` в `.gitignore`.

Проверка 2026-10-27:
- `systemd-analyze verify` — чисто на systemd 255; на 249 — два предупреждения про `RestartSteps` и
  `RestartMaxDelaySec`.
- Установка по шагам 4–6 в Ubuntu 24.04 в Docker: exec до node, `HOME` и `NVM_DIR` есть, `stop` — 0,02 с, код 0;
  паузы 10 → 20 → 39 → 78 с, start-limit не срабатывает.
- `live-update.sh`: все отказы; счастливый путь — 3 мин 31 с без простоя; сломанная сборка — сервис не перезапущен,
  тег на хорошем коммите и при повторе; коммит, падающий на старте, — health 60 с → exit 1, тег не двинулся; откат
  `git switch --detach live-good` и возврат на `main`; неустановленный Node — остановка до сборки; `postinstall` без
  сборки webapp ловится.
- Health с шаблоном до переезда — `disabled`, `TG_BOT_API_KEY missing`. Коды `LastTaskResult` и `instanceIdleTimeout`
  сверены с Microsoft Learn. `tailscale serve` перезаписывает `X-Forwarded-For` адресом устройства
  (`ipn/ipnlocal/serve.go`), `trust proxy` 1 (`src/index.ts:48`).
- `shellcheck` и `bash -n` чисто; `npm run verify` зелёный, CI `verify` зелёный.
- Не проверено без ПК: задача Планировщика в сеансе 0, проброс `localhost` до `tailscale serve`, перезагрузка,
  iPhone, код `wsl.exe` после `wsl --shutdown` — перенесено в FT-159.

---

### FT-157: Nightly database backup to a cloud folder

Status: done
Priority: high
Owner: Claude Code, QA — под-чат проверки
Type: infra
Size: S
Depends on: FT-156 (systemd и копия `~/daftar-live`)

Context:
Решение 2026-10-26. База — один файл в WSL, а весь WSL — один `ext4.vhdx` на диске ПК: `wsl --unregister`,
переустановка Windows или отказ диска уносят все записи. Приложение копирует базу только перед миграциями
(`migrationRunner.ts:28`, `copyFileSync` в `data/backups/`) — на тот же диск.

Definition of Done:
- [x] Скрипт снимает копию через `sqlite3 … ".backup …"` (онлайн-бэкап, безопасен при работающем приложении), проверяет её `PRAGMA integrity_check` и кладёт в `BACKUP_DIR` (облачная папка Windows через `/mnt/c/…`) с датой в имени; хранит последние 30
- [x] Вместе с базой копируются `data/patterns.json` и `data/learning-data.json`
- [x] systemd timer раз в сутки с `Persistent=true`: пропуск, пока ПК был выключен, догоняется после включения
- [x] Ошибка копии видна в journald; пустой или недоступный `BACKUP_DIR` — ошибка, а не тихий пропуск
- [x] Восстановление описано и проверено один раз: остановить сервис → файл из облачной папки на место `data/database.sqlite` → запуск → записи на месте — на маке и в Docker; на ПК — в FT-159
- [x] В документе FT-156 записано: живую базу в облачную папку не класть — синхронизация портит SQLite
- [x] Какой облачный диск — Google Drive (ответ Шукура 2026-10-27): `BACKUP_DIR` — папка Google Drive для компьютера в Windows через `/mnt/…`

Реализовано 2026-10-28 (`284f647`, `11425de`, `7ea2967`, `8483bca`, `e692835`, `f860e42`, `1db09fb`, PR #104):
- `scripts/backup-db.sh`: `sqlite3 .backup` во временную папку WSL → `PRAGMA integrity_check` = `ok` → вместе с
  `patterns.json` и `learning-data.json` (если есть; проверка на целый JSON, до трёх попыток) в `BACKUP_DIR` как
  `daftar-ГГГГММДД-ЧЧММСС.*`, время ташкентское. Каждый файл — под временным `.daftar-….partial`, сверка `cmp`,
  переименование; база последней. Хранит 30, удаляет только файлы со своим шаблоном имени.
- Google Drive: «Папки с компьютера» → `C:\DaftarBackup` → «Sync with Google Drive». Не потоковый `G:` — он есть
  только в сеансе пользователя и в WSL сам не монтируется; не зеркало «Моего диска» — оно скачивает весь Drive. Копия на
  C: появляется сразу, в облако уходит, только пока кто-то вошёл в Windows — записано в документе.
- `BACKUP_DIR` — в `.env.local` живой копии (шаблон: `/mnt/c/DaftarBackup`), переменная окружения важнее: одно место
  для настроек, смена без `sudo` и `daemon-reload`, переустановка unit-шаблона не стирает путь. Не задан, пустой, не
  абсолютный, нет папки, нельзя писать, на диске WSL — ошибка и код 1; папку скрипт не создаёт.
- `ops/live/daftar-backup.service` (oneshot, `Nice=10`, `IOSchedulingClass=idle`, `TimeoutStartSec=30min`, journald
  `daftar-backup`) и `daftar-backup.timer` (`04:00 Asia/Tashkent`, `Persistent=true`, без `RandomizedDelaySec`:
  машина одна, задержка только отложила бы догоняющий запуск).
- «Горячий» журнал после внезапного выключения: база открывается не только на чтение, журнал откатывается, как
  приложение на старте (`-readonly` падал ровно на догоняющем запуске). Второй запуск в ту же секунду берёт следующую.
- Правки ревью: `sqlite3 -init /dev/null` (и stdin из `/dev/null`) во всех вызовах — `~/.sqliterc` ломал проверки;
  удаление никогда не трогает копию этого запуска (часы отстали больше чем на 30 копий) и предупреждает об отставших
  часах; `flock -n` на `data/backups/.backup-db.lock` — второй запуск пишет `another backup is running` и код 1;
  предупреждение в журнал, без отказа, когда в новой копии меньше половины записей предыдущей.
- Документы: `live-instance.md` «Бэкап» вместо заглушки — почему так, установка, проверка, восстановление (сначала
  восстановить, потом таймер; копию выбирать по дате и числу записей), синхронизация в обе стороны и корзина Drive,
  «30 копий — это 30 запусков», «живую базу в облачную папку не класть»; `troubleshooting.md` «Backup Fails»;
  `CLAUDE.md` — `BACKUP_DIR`.

Проверка 2026-10-28:
- 21 тест `tests/backupDb.test.ts` на настоящем скрипте; тест `flock` идёт там, где есть `flock` (CI на Linux), на маке
  пропускается. Правки ревью 1–4 закрыты тестами: `.sqliterc` (через `XDG_CONFIG_HOME`), часы отстали, `flock`,
  падение числа записей. `npm run verify` зелёный, CI `verify` зелёный.
- Под-чат проверки: на копии настоящей базы 300 POST во время бэкапа — все 201, копия целая; ротация 35+1 → 30, 10
  чужих файлов целы; 7 ошибок `BACKUP_DIR` с `status=1/FAILURE`; восстановление на маке — 176 записей,
  `migration:show` — 0 ожидающих.
- Docker, Ubuntu 24.04, systemd 255: установка по документу дословно, `systemd-analyze verify` чисто, `list-timers` —
  04:00 по Ташкенту, догоняющий запуск после «перезагрузки» со сдвинутой отметкой и ни одного лишнего на следующей,
  ошибки в journald, восстановление от имени пользователя сервиса. Повторно: `~/.sqliterc` с `.mode box`, `flock` (два
  одновременных запуска — один пишет, второй код 1, `.partial` не остаётся), предупреждение о пустой базе, часы
  отстали на 35 копий — копия этого запуска цела. `shellcheck` чисто.
- Не проверено без ПК: drvfs `/mnt/c`, выгрузка файлов из WSL Google Drive'ом, rename под антивирусом, выгрузка копий,
  снятых без входа, после входа, догоняющий запуск на настоящем WSL, восстановление под systemd — в FT-159.

---

### FT-168: Rename Daftar to Kapelka

Status: done
Priority: high
Owner: Claude Code, QA — под-чат проверки
Type: rebrand
Size: M

Context:
Решение 2026-10-28: продукт называется Kapelka; переименовать до установки живого экземпляра на ПК (FT-159). Что
затрагивает переименование — `docs/NAMING.md`, раздел «Что затронет переименование». Шукур тем временем делает
Windows-часть установки — она от имени не зависит.

Definition of Done:
- [x] Всё, что видит пользователь, называется Kapelka: webapp (заголовок, манифест PWA, wordmark, «Вход в … из браузера», подпись с версией), тексты и кнопки бота (`/start`, «Открыть … ↗», вход через бота), имя выгрузки `kapelka-<дата>.csv`, текст кнопки меню Mini App по умолчанию, wordmark в `docs/pastel/design-system.md` и `tokens.json`; в пользовательских строках `grep -ri daftar` пусто
- [x] Не меняются, с комментарием в коде почему: cookie `daftar_session` / `daftar_login`, база Dexie `daftar-offline`; репозиторий и имя пакета тоже
- [x] Живой экземпляр: `~/kapelka-live`, `kapelka.service`, `kapelka-backup.service` / `.timer`, папка бэкапа `C:\KapelkaBackup`, копии `kapelka-*.sqlite`, имя задачи Планировщика и `SyslogIdentifier` — в `ops/live/`, `scripts/`, `live-instance.md`, `troubleshooting.md`, `quick-start.md`, `CLAUDE.md` и в FT-159
- [x] `live-instance.md`: ПК получает нового бота «Kapelka» из BotFather, @FinanceTrackerDevBot отходит маку (решение 2026-10-28)
- [x] Документы о текущем состоянии говорят Kapelka (`CLAUDE.md`, `docs/pastel/README.md`, гайды по iPhone); архив и записи решений не переписываются
- [x] `npm run verify` проходит; экраны с wordmark и вход в браузере — скриншоты 390 px в светлой и тёмной теме

Реализовано 2026-10-28 (`3673a35`, `8eb3b3b`, `56718d4`, правки ревью `e4035ee`, `accaba3`, PR #106):
- Видимое — Kapelka: `<title>` и `apple-mobile-web-app-title`, манифест PWA (`public/manifest.json` и `vite.config.ts`,
  были «Finance Tracker» / «Finance»), wordmark `kapelka` строчными, «Вход в Kapelka из браузера», «Kapelka · версия
  0.1», вход в браузере, подсказки сверки остатка, первый запуск, пустые «Последние»; бот — `/start`, «Открыть Kapelka ↗»,
  «Открыть в Kapelka ↗», «Остальные — в Kapelka ↗», «Нужно проверить в Kapelka», вход через бота, счёт «⭐ Kapelka
  Premium»; выгрузка `kapelka-<дата>.csv`; кнопка меню `MINIAPP_MENU_TEXT=Kapelka` в шаблоне ПК, `Kapelka DEV` по
  умолчанию в `dev:miniapp`; `design-system.md`, `tokens.json` (сгенерированные токены не изменились). Род женский:
  «Kapelka уже открыта», «Kapelka сама поймёт».
- Сохранено с комментарием почему: cookie `daftar_session` / `daftar_login` (новое имя разлогинит браузеры), база Dexie
  `daftar-offline` (потеряется очередь неотправленных записей), ключ `localStorage` `daftar-theme` (забудется тема);
  `~/.config/daftar/dev.env` — путь инструментов штаба на маке; репозиторий и имя пакета.
- Живой экземпляр до установки: `~/kapelka-live`, `kapelka.service`, `kapelka-backup.service` / `.timer`,
  `SyslogIdentifier`, `C:\KapelkaBackup`, копии `kapelka-<дата>-<время>.sqlite`, задача Планировщика «Kapelka WSL», unit по
  умолчанию в `live-update.sh`; `tests/backupDb.test.ts` — длина метки берётся из неё, а не числом 18.
- Бот: ПК получает нового бота «Kapelka» из BotFather, @FinanceTrackerDevBot отходит маку для разработки. «Переезд» в
  `live-instance.md` начинается с BotFather (`/newbot`, по желанию `/setname`, `/setdescription`, `/setuserpic`) и
  кончается `/start` в новом боте; репетиция — на самом боте Kapelka. Шаг 4 «Переезда» — очистить `bot_messages` в
  перенесённой базе до первого запуска («да» Шукура 2026-10-28): номера сообщений нового бота совпали бы со старыми.
- Документы о текущем состоянии: `CLAUDE.md` (имя продукта, что сохранено, чей бот), README, фокус `TASKS.md`,
  `docs/pastel/README.md` и `design/README.md` (холст и копия досок ещё говорят daftar — при сверке не расхождение),
  гайд по iPhone, FT-159 и FT-161. Архив, `decisions.md`, `handoff.md`, `NAMING.md`, `AUTONOMOUS_REPORT.md` и копия
  холста в `design/` не переписаны.
- Правки по проверке: неразрывный пробел в «Открыть Kapelka» в шторке «Сводка дня»; откат переезда называет бота —
  мак снова опрашивает Kapelka (FT-159 и «Откат переезда» в `live-instance.md`); живой на маке до переезда обновлять
  можно — меняются только надписи; FT-169 — свой знак для Kapelka.

Проверка 2026-10-28:
- Под-чат проверки: Definition of Done по пунктам; `git grep -i daftar` — остались только сохранённые имена (совпадают с
  `main`), история, копия холста и описание переименования. `backup-db.sh` после смены префикса — шаблоны через
  `$PREFIX`, метка 19 символов, `tests/backupDb.test.ts` 20/20. `npm run verify` — Jest 1380 + 1 skipped, Vitest 1201;
  CI `verify` зелёный. Экспорт `GET /api/export` → `kapelka-2026-10-28.csv`. Скриншоты 390 px в светлой и тёмной теме:
  первый запуск, главная с wordmark, скелет, «Ещё», шторка «Сводка дня», «Сверить остаток», вход в браузере — всё
  помещается. Находка про `bot_messages` подтверждена по коду; кроме кнопок и `/undo`, `awaitingAmount()` перехватил бы
  ответ на старый вопрос «Сколько?».
- Штаб, бот вживую (@FinanceTrackerDevBot, копия ветки, живой экземпляр остановлен 13:51–13:59): `/start` → «Это
  Kapelka — учёт расходов и доходов.» и «Открыть Kapelka ↗»; «кофе 25000» → подтверждение; «Изменить» → «Открыть в
  Kapelka ↗»; `/today` → «Итоги дня · 28 октября …» и «Открыть Kapelka ↗».
- Не проверено вживую: вход из браузера через бота (нужен HTTPS-адрес Mini App) — покрыт тестами.

---

### FT-171: A new record creates a phantom user to count usage

Status: done
Priority: medium
Owner: Claude Code, QA — под-чат проверки
Type: bug
Size: S

Context:
Найдено 2026-10-28 на ПК при первой записи в Kapelka (пустая база): после `/start` в `users` одна строка, после
«кофе 25000» — две. У второй `telegram_id` — UUID настоящего пользователя, создана в ту же секунду, что и запись.

Причина — `CreateTransactionUseCase.incrementTransactionCount` (`src/modules/transaction/application/createTransaction.ts`):
`userId` записи уже UUID, а метод передаёт его в `getOrCreateUserUseCase` как `telegramId`. Пользователя с таким
`telegram_id` нет — создаётся новый, и счётчик `transactions` бесплатного тарифа растёт у него. Комментарий «Resolves
telegramId to UUID if needed» не выполняется: `resolveUserIdToUUID` (`src/shared/application/helpers/userIdResolver.ts`)
UUID возвращает как есть, но здесь не вызывается.

Что ломается: у каждого пользователя после первой записи — один лишний «пользователь» (дальше он переиспользуется);
счётчик записей настоящего пользователя всегда 0 — с `FREE_LIMITS_ENABLED=true` лимит в 50 записей не сработал бы.
Итоги дня и напоминания фантому не уходят (только `ALLOWED_TELEGRAM_IDS`), записи, счета и категории не задеты.
Такие строки, вероятно, есть и в базе мака.

Definition of Done:
- [x] `incrementTransactionCount` разрешает id через `resolveUserIdToUUID` (UUID — как есть, Telegram id — в UUID) и не создаёт пользователя по UUID
- [x] Тест: запись от пользователя с UUID не добавляет строку в `users`, счётчик `transactions` растёт у него самого
- [x] Поиск других мест, где UUID уходит в `getOrCreate` как `telegramId` (например, `deleteDebt.ts`); найденное — исправлено или записано
- [x] Уборка фантомов (`users.telegram_id` в виде UUID и их `usage_limits`) — только список для Шукура; удаление на живой базе — после его «да»

Реализовано 2026-10-28 (`45a245a`, PR #109):
- `CreateTransactionUseCase.incrementTransactionCount` и счётчик при удалении и возврате записи (`deleteTransaction.ts`)
  разрешают id через `resolveUserIdToUUID`: UUID записи остаётся как есть, старый Telegram id становится UUID
  пользователя. Пользователь по UUID больше не создаётся, счётчик `transactions` растёт у владельца записи.
- Тест `tests/usageCountOwner.test.ts` на настоящей SQLite после миграций: запись от UUID не добавляет строку в `users`
  и считается у владельца; запись с Telegram id — у того же владельца; удаление и возврат двигают счётчик владельца.
- Другие места: `createDebt.ts`, `deleteDebt.ts`, `payDebt.ts` уже проверяют `isUUID` до `getOrCreate`; middleware и
  обработчики бота передают настоящий Telegram id — правок не нужно. Двойного счёта нет: `transactions` считает только
  use case, бот — только `voice_inputs`, middleware инкремента нигде не подключены.
- Фантомы: в PR — `SELECT` строк `users` с UUID в `telegram_id` и их `usage_limits`. На копии базы мака — 4 строки
  (2 январских тестовых пользователя, 2 октябрьских); у трёх стартовые счёт и 16 категорий от миграций, записей нет.
  Ничего не удалено. На ПК (пустая база с 2026-10-28) фантом один — от первой записи «кофе 25000».

Проверка 2026-10-28:
- Под-чат проверки: тест падает без исправления (2 из 3; откат только `deleteTransaction.ts` роняет тест удаления —
  обе половины ловятся отдельно). `npm run verify` — Jest 1383 + 1 skipped, Vitest 1201; CI `verify` зелёный.
- Настоящий прогон на чистой базе (порт 3200, без бота): `POST /api/quick-capture` «кофе 25000» от `131184740` — в
  `users` одна строка, `transactions_count = 1` у неё, строк с UUID в `telegram_id` нет; удаление — счётчик 0, возврат —
  снова 1, пользователей по-прежнему один; повтор с тем же `clientId` счётчик не меняет.
- Мелкое, мерж не держит: `guest_*` теперь считается в `usage_limits` без строки в `users` (гостевого режима нет с Д4);
  `isUUID` принимает только v4 — все id в приложении v4.

---

### FT-151: Flaky HTTP tests: webLogin, transactionRoutes, accounts

Status: done
Priority: low
Owner: Claude Code, QA — под-чат проверки
Type: repo-hygiene
Size: S

Context:
`tests/webLogin.test.ts` один раз упал в полном прогоне `npm run verify` при проверке ветки
`claude/new-session-uv5og7` и прошёл на повторе. Кандидаты:
- каждый `beforeEach` создаёт SQLite и прогоняет все миграции с копией базы (`:87-96`, `tests/helpers/testDatabase.ts:15-28`), а в `jest.config.js` нет `testTimeout` — под нагрузкой хук может не уложиться в 5 с;
- ограничители частоты общие на весь файл и на реальных часах: `strictRateLimiter` — 10 POST за 15 минут на `/api/auth/web-login` (`rateLimitMiddleware.ts:90-112`), в блоке маршрутов уже 8 таких запросов (`:397`…`:514`).

Так же нестабилен `tests/transactionRoutes.test.ts`, тест «creates a record without a description»: дважды
2026-10-27 упал в полном прогоне (`fetch failed` / `ECONNRESET` / «other side closed»), отдельно — 20 прогонов из 20
зелёные (проверка FT-155). 2026-10-28 при закрытии FT-168 (коммит только с документами) в полном прогоне по
одному разу упали `transactionRoutes.test.ts` («creates a record without a description», 404 вместо 201) и
`tests/accounts.test.ts` («creates an account», 404 вместо 201); отдельно оба — 36 из 36. Машина была под нагрузкой
(load average около 5) — похоже на общую причину HTTP-тестов, а не на конкретный файл.

Definition of Done:
- [x] Причина найдена и записана здесь
- [x] Ограничители не общие между тестами (сброс или внедрение)
- [x] 20 полных прогонов `npm run test:ci` подряд без падения этого файла

Реализовано 2026-10-29 (`97b9957`, `7b14e66`, `aad4126`, `dd175c7`, PR #112):
- Причина — не таймауты и не лимиты. Тестовый сервер слушал порт 0 на всех интерфейсах (`app.listen(0)` — это `[::]`),
  а тест звал `http://127.0.0.1:<порт>`. macOS выдаёт порты по порядку и для `[::]` не смотрит на IPv4-слушателей:
  сервер мог получить порт, который другая программа мака держит на `127.0.0.1` (Notion, VS Code, OrbStack, GitKraken,
  Termius). Запросы теста уходили ей: 404 от программы с HTTP, обрыв (`fetch failed` / `ECONNRESET`) от остальных.
  Поэтому редко, только в полном прогоне и чаще под нагрузкой — когда счётчик портов доходит до порта такой программы.
- Доказательства. Синтетика: слушатель на `127.0.0.1:N+1` — `listen(0)` получает `::` N+1, запрос — «404 other server»;
  с `listen(0, '127.0.0.1')` ядро N+1 пропускает. Настоящая программа: счётчик сдвинут к 50274, `listen(0)` получил
  `*:50275`, `lsof` — `Notion 127.0.0.1:50275 (LISTEN)` и `node *:50275 (LISTEN)`; Notion запросов не получал.
  Настоящие тесты под перехватчиком портов (диагностика, не в репо) на `main`: `transactionRoutes` + `accounts` +
  `webLogin` — 32 из 64 упали ровно как в задаче (404 вместо 201); со слушателями, рвущими соединение, — 18 из 20 с
  `fetch failed` / `read ECONNRESET`. На ветке — 64 из 64 и 20 из 20, перехватчики запросов не получили.
- Отброшено: `openMigratedDatabase()` под нагрузкой — медиана 28 мс, максимум 68 мс из 40 запусков (запас около 70×
  до 5 с), `testTimeout` не добавлен. Ограничители падений не давали (429 не было) — сброс сделан по DoD.
- Изменено: `listenOnLoopback(app)` в `tests/helpers/testServer.ts` слушает `127.0.0.1` и запускает общие
  ограничители с пустыми счётчиками; `startTestServer()` идёт через него; 17 серверов в 14 файлах переведены на него,
  `aiRateLimiter.resetKey(...)` в трёх файлах больше не нужен. В `rateLimitMiddleware.ts` у каждого общего ограничителя
  свой `MemoryStore`, `resetSharedRateLimiters()` их обнуляет; числа лимитов не менялись.
- Тесты `tests/testServer.test.ts`, красные до исправления: сервер получает свои запросы, когда следующие порты держит
  чужой слушатель; новый сервер начинает с пустыми счётчиками (после 10 строгих POST — 201, не 429); страж — каждый
  вызов `listen` в `tests/` называет `'127.0.0.1'` сам (ловит `listen()`, `'::'`, `'localhost'`, `{ port: 0 }`,
  вызов на нескольких строках и хост в переменной; формы покрыты табличными тестами).
- По проверке: `holdNextPorts` при пробном порте 65527…65535 доходил до `listen(65536)` — `RangeError` вне `try`,
  занятые порты не освобождались, Jest зависал вместо падения. Теперь цикл до 65535, захват внутри `try`, `finally`
  закрывает занятое. Воспроизведено и проверено сдвигом счётчика к 65526.
- `.claude/`: в основной папке `testMatch` брал тесты всех копий агентов из `.claude/worktrees/` — 295 наборов вместо
  93, `JavaScript heap out of memory`, haste-коллизии на их `package.json`. В `jest.config.js` —
  `testPathIgnorePatterns` (`/node_modules/`, `<rootDir>/.claude/`, `<rootDir>/dist/`) и `modulePathIgnorePatterns`
  (`<rootDir>/.claude/`). Вложенный `.claude/worktrees/x/tests/x.test.ts` с `package.json`: до правки `--listTests`
  его видит (94, коллизия), после — нет (93); копия свои тесты находит.
- Поправка к коммиту `7b14e66`: в нём сказано, что `resetKey('::ffff:127.0.0.1')` «никогда не совпадал», — неверно:
  `ipKeyGenerator` сводит такой адрес к `127.0.0.1`, строка была лишней, а не мёртвой.
- `troubleshooting.md`: 404 / `fetch failed` только в полном прогоне; нехватка памяти в основной папке.

Проверка 2026-10-29:
- Под-чат проверки: независимое воспроизведение на `main` под перехватчиком портов — 36 из 64 тестов упали с 404; на
  PR — 64 из 64 и 93 из 93 наборов. 5 из 5 `test:ci` подряд и `verify` зелёные. Production-лимиты без изменений:
  запуск API на `main` и на PR дал одинаковые счётчики. Найдена граница портов у 65535 — исправлена (выше).
- Под-чат разработки: 20 полных `test:ci` подряд — 20 из 20 зелёные (1386 passed, 1 skipped; 73–92 с на прогон; load
  average 6–42, параллельно работал другой под-чат). `verify` после правок по проверке зелёный: Jest 93 набора, 1398 +
  1 skipped; Vitest 122 файла; сборка webapp, fonts, tokens, dependency-cruiser, madge. CI `verify` на PR зелёный.

---
