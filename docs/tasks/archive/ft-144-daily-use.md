# Архив задач — ежедневное пользование и переезд на ПК

Задачи с FT-144: надёжность, закрытый доступ, переезд живого экземпляра на ПК.

Закрыто задач: **45**. Это архив: задачи здесь не переоткрываются и не редактируются.
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

### FT-167: Bot restart does not drop updates in flight

Status: done
Priority: medium
Owner: Claude Code, QA — под-чат проверки
Type: reliability
Size: S

Context:
Найдено при проверке FT-154 (2026-10-27). SIGTERM не ждёт обработчиков бота, которые уже работают: `bot.stop()` прерывает только `getUpdates`, обещание `launch` никто не ждёт, и база закрывается посреди обработки (например, голос через OpenAI). Offset пачки не подтверждён — после перезапуска Telegram пришлёт её снова; если запись уже сделана, возможен дубль. На ПК `systemctl restart` будет при каждом обновлении (FT-156). Заодно: счётчик попыток запуска polling не сбрасывается после удачного запуска (в разработке поздний 409 сразу даёт `failed`); в production пустой `TG_BOT_API_KEY` даёт `disabled` и health 200 — бот молчит без ошибки.

Definition of Done:
- [x] Остановка ждёт обработчики, которые уже работают (с пределом, меньше 10 с общего таймаута), и только потом закрывает базу; тест
- [x] Перезапуск во время обработки сообщения не создаёт дубль записи; тест
- [x] Счётчик попыток polling сбрасывается после удачного запуска; тест
- [x] В production без `TG_BOT_API_KEY` при включённом polling — ошибка старта; тест

Реализовано 2026-10-29 (`4346fbe`, `e07f524`, `e66d4d0`, `6da3f77`, `b3d70f5`, PR #113):
- Остановка (`src/delivery/runtime/gracefulShutdown.ts`, `telegramBot.ts`, `src/index.ts`): у бота больше нет своих
  слушателей SIGTERM/SIGINT. `startTelegramBot()` возвращает объект со `stop(graceMs)`; шаг завершения `stopBot`
  прерывает `getUpdates` и ждёт до `BOT_STOP_GRACE_MS` (5 с), пока цикл Telegraf доделает обработчики пачки и
  подтвердит offset. Идёт одновременно с закрытием HTTP-сервера (тоже 5 с), так что оба укладываются в общие 10 с;
  база закрывается после обоих. Сигнал, пока `getMe` не ответил, обрывает запуск в `onLaunch`, до опроса. Окно
  `deleteWebhook` при старте не закрыто — у Telegraf нет точки между ним и первым `getUpdates` (описано в
  `runtime-process-mode.md`).
- Повторная доставка (`utils/messageClientId.ts`, `messageHandlers.ts`, `recordHandlers.ts`, конвейеры текста и
  голоса): всё, что делает сообщение Telegram, несёт его client id `tg-<bot id>-<chat id>-<message id>` (до 48
  символов из 64, с местом для `:n`) поверх уникального индекса `(userId, client_id)` из FT-106. Id бота в нём — потому
  что личный чат у всех ботов один, а новый бот нумерует сообщения с 1. Id получают записи текста и голоса, сумма после
  кнопки категории, ответ на «Сколько?». Ответ суммой («Сумму», крупная сумма, «не 25, а 28») записей не создаёт —
  `changeAmount` кладёт id ответившего сообщения в состояние сообщения бота (`answeredBy`). Охранник
  `createRepeatedMessageGuard` первым в цепочках текста и голоса ищет id в записях и в `answeredBy`: найдено — ничего
  не разбирается, не скачивается, не пишется и не меняется; подтверждение уходит, только если его ещё нет в
  `bot_messages`.
- Счётчик запусков polling: запуск, проработавший `POLLING_STABLE_MS` (80 с по умолчанию — дольше длинного опроса и
  двух самых длинных пауз), считается удачным, следующий сбой — попытка 1. Паузы ограничены пределом таймера
  2^31−1 мс: при `TELEGRAM_POLLING_MAX_RETRIES=20` Node сработал бы через 1 мс.
- Production без токена: при `NODE_ENV=production`, включённом polling и пустом `TG_BOT_API_KEY`
  `AppConfig.validate()` останавливает старт; при `ENABLE_TELEGRAM_POLLING=false` старт без токена — как раньше.
- Тесты: `gracefulShutdown.test.ts`, `telegramBotGracefulStop.test.ts` (настоящий цикл Telegraf с подменённым Bot API:
  обработчик доходит до конца → offset подтверждён → закрывается база), `telegramBot.test.ts`,
  `telegramRedelivery.test.ts` (настоящая SQLite и конвейеры захвата: текст, голос, сумма после категории,
  «Сколько?», «Сумму», крупная сумма, другой бот с тем же номером сообщения), `telegramBotToken.test.ts`. Документы:
  `runtime-process-mode.md` (Update FT-167), `troubleshooting.md`, `live-instance.md`, `voice-to-transaction.md`,
  `quick-start.md`, `CLAUDE.md`.

Проверка 2026-10-29:
- Под-чат проверки: мутации — откат каждой части по отдельности роняет её тесты. Сценарии R1–R6 на настоящей SQLite;
  после правок повторно R2 (тот же номер сообщения от другого бота после `DELETE FROM bot_messages`) и R4 (повторный
  ответ на «Сумму») — закрыты. Сценарии S1–S7 на настоящей SQLite.
- Настоящий запуск `node dist/index.js` без бота: health 200 `disabled`, SIGTERM → код 0; production с включённым
  polling без токена → код 1 с понятной ошибкой. `npm run verify` зелёный.
- Проверка на живом dev-боте (сообщение и сразу перезапуск, ответ на «Сумму» и перезапуск) ещё не делалась.
- Найдено вне DoD — в FT-172: повторный `/undo` после перезапуска; подтверждение от охранника без «Сколько?»,
  «Расслышал», «?»; `answeredBy` помнит один ответ в последних 20 сообщениях.

---

### FT-150: Bare «яндекс» and «uber» should not mean Transport

Status: done
Priority: medium
Owner: Claude Code, QA — под-чат проверки
Type: bug
Size: S

Context:
У старой категории `taxi` синонимы `яндекс`, `yandex`, `uber` (`Category.ts:68`); их забирает стартовая «Транспорт»
(`categoryPresets.ts:26`, `:98-106`). В выученных словах тоже есть `yandex` (`data/patterns.seed.json:16-24`). Быстрый
путь FT-143 ищет категорию по словам подписи (`processTextInput.ts:570-588`, `categoryGuess.ts:72-95`), поэтому
«яндекс плюс 99000» и «uber eats 120000» уходят в «Транспорт» без ИИ, хотя «Яндекс Плюс» — подписка
(`subscriptionCatalog.ts:44-53`). Записано в `docs/pastel/handoff.md`.

Definition of Done:
- [x] Голые «яндекс», «yandex», «uber» категорию не дают — фраза идёт к ИИ; «яндекс такси», «yandex go», «такси» — «Транспорт» без ИИ
- [x] «яндекс плюс 99000» и «uber eats 120000» не попадают в «Транспорт»; тесты
- [x] `patterns.seed.json` не учит голое «yandex» как транспорт

Реализовано 2026-10-29 (`4e44537`, `bb824ab`, `ec5d102`, `cf30fe7`, PR #114). Шесть мест, где синоним становится
категорией:
- **Словарь быстрого пути** (`presetSynonyms` из `Category.ts`). У «Такси» убраны «яндекс», «yandex», «uber»;
  остались «такси», «yandex go», «яндекс го», «taxi». «яндекс такси» и «uber taxi» дают «Транспорт» словами «такси»,
  «taxi».
- **Выученные слова** (`namingWordsOf`). `BARE_BRANDS` в `categoryGuess.ts` — «яндекс», «yandex», «uber», «убер» с
  окончаниями — не дают категорию ни словом паттерна, ни псевдонимом мерчанта; «yandex go» считается. Из
  `patterns.seed.json` убрано «yandex». Живой `patterns.json`, скопированный из старого сида при первом исправлении,
  бренд на быстрый путь не вернёт.
- **Подбор категории по тексту** (`presetForLegacyCategory`). Подпись простой фразы, когда ИИ не ответил, и
  офлайн-запись, отправленная до загрузки категорий: голое «яндекс» теперь «Другое» (на тексте — «Другое ?»), было
  «Транспорт».
- **Подсказки промпта ИИ** (`presetHints` → `lines()` в `categoryPrompt.ts`). «яндекс» больше не подсказка
  «Транспорта». `lines()` не выводит подсказку с голым брендом (`mentionsBareBrand`) — рядом с фильтром «подсказка —
  название другой категории». Поэтому «яндекс го» остаётся синонимом быстрого пути, но в промпт не попадает. Проверка
  с настоящим ИИ, по 3 прогона: с «яндекс го» в подсказках «Транспорта» «яндекс плюс 99000» и «яндекс 20000» уходили
  туда 3 из 3, без неё «яндекс плюс» — «Кафе», «Другое», «Связь».
- **Выученные паттерны в промпте ИИ** (`getEnhancedPrompts`). Голый бренд не показывается ни в словах паттерна, ни в
  псевдонимах мерчанта: старый `patterns.json` не скажет ИИ «yandex» → «Транспорт».
- **Офлайн-разбор на телефоне** (`offlineText.ts`). Код не менялся: телефон смотрит первое слово по своему списку,
  брендов в нём нет. Тест Vitest закрепляет «яндекс 20к», «uber eats 120к» → «Другое».
- Тесты: `tests/bareBrandCategory.test.ts` (красные до исправления), ожидание сида в `tests/categoryGuess.test.ts`.
  Доки: правило слов в `docs/pastel/api.md`, `docs/pastel/handoff.md` больше не числит FT-150 открытой.
- Вживую на `fdc7d2d`: `POST /api/quick-capture`, порт 3100, бот выключен, свежая SQLite, настоящий OpenAI.

  | Фраза | Ответ | Категория | «?» |
  |---|---|---|---|
  | Яндекс Го 18000 | 0,08 с | Транспорт | нет |
  | yandex go 18000 | 0,02 с | Транспорт | нет |
  | яндекс такси 18000 | 0,03 с | Транспорт | нет |
  | яндекс плюс 99000 ×3 | 1,4–2,4 с | Связь, Связь, Кафе | да |
  | яндекс 20000 | 1,4 с | Другое | да |
  | убер итс 120000 | 1,9 с | Транспорт | да |
  | uber eats 120000 | 1,4 с | Кафе | да |

Проверка 2026-10-29:
- Под-чат проверки: откаты исправления по кускам краснят тесты (15 / 2 / 1 / 1 упавших). Вживую быстрый путь
  отличается от ИИ по времени ответа на таблице фраз; старый `patterns.json` с «yandex» не возвращает бренд на быстрый
  путь; составные фразы разбираются как раньше; регрессий в других категориях нет; `verify` зелёный. Найдено и
  исправлено в том же PR: «Яндекс Го» ушёл к ИИ — возвращён через фильтр подсказок; «убер» добавлен в `BARE_BRANDS`;
  офлайн-проверка «яндекс такси 20к» → «Другое» убрана — это ограничение первого слова, а не голый бренд; рваный
  перенос в `api.md`.
- Под-чат разработки: `verify` на `fdc7d2d` (после слияния `main` с FT-151) — Jest 94 набора, 1426 + 1 skipped;
  Vitest 122 файла, 1202; сборка, fonts, tokens, dependency-cruiser, madge. Прогон, оборванный сном мака, не в счёт.

Известно:
- Голое «яндекс» нельзя научить исправлением: `BARE_BRANDS` отбрасывает его из выученных слов и из промпта.
- «яндекс плюс» у ИИ скачет между «Кафе», «Связь», «Другое», всегда с «?». «убер итс 120000» ИИ отнёс к
  «Транспорт?» — это выбор ИИ, не быстрый путь.
- Офлайн-разбор читает только первое слово: «яндекс такси 20к» без связи — «Другое» (FT-129).
- Живой `data/patterns.json` на ПК не смотрели и не правили; «yandex» в нём, если есть, ни на что не влияет.

---

### FT-164: A notice that never left leaves a trace

Status: done
Priority: medium
Owner: Claude Code, QA — под-чат проверки
Type: reliability
Size: M

Context:
Найдено при проверке FT-144 (2026-10-27). Вечером 26.10 итог дня 12 раз не ушёл (`ENOTFOUND` в коротких
пробуждениях мака, 21:08–23:53) и после полуночи пропал без строки в `notifications_log`: по замыслу FT-144 итог
«пора» только до конца дня (`dailySummary.ts`, тест `dailySummary.test.ts:425`), а `failed` пишет только тот, кто
пробует в следующий раз. Счётчик попыток живёт в памяти и обнуляется при перезапуске. Так же без следа пропадают
напоминание о подписке и зов на ревизию 1-го числа; напоминание о цели может прийти на день позже. На ПК (FT-156),
который включён «как получится», такое будет чаще.

Definition of Done:
- [x] Уведомление, которое не ушло до конца своего окна (итог — до полуночи пользователя, подписка — её день,
      ревизия — 1-е число), получает строку `failed` с причиной: «не ушло: нет сети, N попыток, последняя ошибка …»; тест
- [x] Число попыток переживает перезапуск (заявка остаётся в статусе «не ушло» с `attempts`, следующий тик забирает её
      атомарным `UPDATE … WHERE status = …`); тест с перезапуском
- [x] «Не больше одного раза» не меняется: строка `sending` по-прежнему не повторяется; тест
- [x] Удачная попытка после неудачных видна в логе с номером попытки
- [x] Миграция проверена на копии настоящей базы
- [x] Решено и записано: может ли напоминание о цели прийти на следующий день; присылать ли утром «итог за вчера» —
      **да, догоняем утром** (решение Шукура 2026-10-29, `decisions.md`); строка `failed` с причиной пишется в любом случае
      (вопрос Шукуру)

Реализовано 2026-10-29 (`aa9a264`, `957e282`, `42e7213`, `8e3ab0a`; по проверке `cb65ba9`, `4503eaa`, `ef49cdb`; PR #115):
- Попытки живут в базе. Запрос, который не ушёл с машины (`ENOTFOUND`, `EAI_AGAIN`, `ECONNREFUSED`), больше не
  освобождает строку `notifications_log`: она остаётся `not_sent` с `attempts`, последней ошибкой и последним днём
  отправки `send_until` (`YYYY-MM-DD` по часам пользователя). Следующий тик, и после перезапуска тоже, забирает её
  атомарно: `UPDATE … SET status = 'sending', attempts = attempts + 1 WHERE id = ? AND status = 'not_sent'` (`retake`).
  Строку `sending` не забирает никто — не больше одного раза. Таймаут, `ECONNRESET` и отказ Telegram остаются `failed`.
- След. Когда `send_until` прошёл, первый тик следующего дня (раз в день на пользователя) ставит `failed` с причиной
  «не ушло: нет сети, 12 попыток, последняя ошибка getaddrinfo ENOTFOUND api.telegram.org»; без попыток — «не ушло: ни
  одной попытки». Удачная отправка после неудачных хранит `attempts = N` в строке и пишет в лог `… sent on attempt N`.
- Окна (`domain/noticeWindow.ts`): итог — его день; цель — до конца следующего дня после первой попытки (решение
  2026-10-29); подписка — её день; ревизия и повтор после «Позже» — день первой попытки.
- «Итоги за вчера» — новый вид `daily_summary_late` (период — день, о котором итог). Первый тик нового дня, в том числе
  ночью, решает и хранит в базе: вчерашние итоги не ушли (`not_sent`) или вовсе не пробовались (строки нет, а за
  какой-нибудь день раньше вчерашнего строка `daily_summary` есть) — строка «за вчера» ждёт в `not_sent` с 0 попыток,
  у вчерашнего дня без строки остаётся след `failed` без попыток. С 08:00 «за вчера» уходит и пробуется до конца дня.
  Текст — как у обычного итога, заголовок «Итоги за вчера · 14 октября», месяц — до того дня (`throughToday` у
  `GetMonthAnalyticsUseCase`; экран аналитики и `/month` — весь месяц, FT-141); в пустом дне — «Трат правда не было?»
  с подсказкой «вчера обед 45к», он считается в «2 вечера подряд»; после «Да, не было» заголовок остаётся «за вчера».
- Принятые рамки догона (в PR, владелец может поправить): только вчера, без очереди за несколько дней; не раньше 08:00
  и до конца следующего дня; сегодняшний итог — как обычно (время итогов 20:00–23:00, поэтому вчерашний всегда раньше;
  будь время раньше 08:00, сегодняшний пришёл бы первым); догоняется то, что не ушло с машины или не пробовалось, — не
  отказ, не таймаут, не `sending`; итоги выключены — догона нет, не ушедшее всё равно закрывается; подписка и ревизия не
  догоняются. Известный край принят: история настроек не хранится — итоги выключены вчера, включены сегодня и бот после
  этого перезапустился — может прийти «итог за вчера».
- Миграция `NotificationAttempts1762500000000`: `attempts integer NOT NULL DEFAULT 0`, `send_until varchar`; старые
  строки — 0 и `NULL`. Откат переводит `not_sent` в `failed` (старый код его не знает) и удаляет колонки.
- Код: `application/noticeAttempts.ts` — общий цикл попытки для обоих планировщиков (`claimOrTake`, `takeOpen`,
  `leaveNotSent`, `closeExpired`); `DailySummaryNotifier`, `RemindersNotifier`; репозиторий — `transition`, `retake`,
  `expired`, `hasEarlier`, `lastSent` по нескольким видам; `summarySender` и `formatDaySummary` с `late`.
- По проверке: месяц в «Итогах за вчера» включал сегодняшние записи — теперь до того дня; подсказка «вчера обед 45к»;
  заголовок «за вчера» после «Да, не было» в обоих ответах; причина без попыток нейтральная; `attempts + 1` считается
  в самом UPDATE, а не из прочитанного раньше. Тесты на каждую правку, красные до неё.
- Документация: `CLAUDE.md` (NotificationModule), `modules.md`, `runtime-process-mode.md`, `database-guide.md`,
  `docs/pastel/components/BotNotice.md`.
- Не сделано, вынесено в FT-173: подписка и ревизия при боте, выключенном весь их день, не оставляют строки.

Проверка 2026-10-29:
- Под-чат проверки: блокеров нет, двойной отправки не найдено. 10 мутаций кода — каждый откат краснит тесты. Сценарии:
  два процесса над одной базой, перезапуск между `sending` и `sent`, Нью-Йорк 07:59 / 08:00, Гонолулу, 31.10 → 1.11.
  Миграция на копии бэкапа: 12 строк `notifications_log`, `run` / `revert` / `run`, хеши `transactions` и `users`
  совпали, `integrity_check` — ok. Известный край принят.
- Под-чат разработки: миграция на копии `data/backups/before-seed-removal-20261026-140811.sqlite` (`sqlite3 -readonly
  .backup`): до — одна ждёт, расхождение ровно в двух колонках; `notifications_log` 12 строк (failed 5, sent 1,
  skipped 6), `transactions` 133, `users` 10; после `run`, `revert` и снова `run` — те же 12 строк и статусы, схема
  совпадает с сущностями. `verify` зелёный до правок (Jest 93 набора, 1405 + 1 skipped; Vitest 122 файла, 1201) и после
  правок по проверке со свежим `main` (FT-151): Jest 94 набора, 1422 + 1 skipped; Vitest 122 файла, 1201; и ещё раз
  после `main` с FT-167: Jest 97 наборов, 1453 + 1 skipped; Vitest 122 файла, 1201; сборки, dependency-cruiser и madge
  чистые — каждый раз с первого прогона, без флейков.

---

### FT-163: Records made before first launch are counted twice in the balance

Status: done
Priority: low
Owner: Claude Code, QA — под-чат проверки
Type: bug
Size: S

Context:
Замечание из локальной проверки 2026-10-21 (`docs/pastel/handoff.md`, «Проверено в браузере»); задачи в backlog не
было. Первый запуск (FT-109) спрашивает «Сколько у вас сейчас денег?» и пишет ответ начальными остатками с сегодняшней
датой. Записи, сделанные в тот же день до первого запуска (бот, Shortcut), входят в остаток поверх введённой суммы:
расход вычитается дважды. Встречается только у того, кто записывал до первого запуска; у Шукура первый запуск уже был.

Definition of Done:
- [x] Записи, сделанные до ввода начальных остатков (по моменту, а не по дате), в остаток не входят; тест
- [x] Записи после первого запуска в тот же день входят в остаток, как раньше; тест
- [x] История и аналитика показывают все записи, как сейчас

Реализовано 2026-10-29 (`703a97d`, `316c7bf`, `d6e3f97`, PR #116):
- Колонка `accounts.opening_at` — момент, когда первый запуск ввёл остатки, тот же, что `onboardedAt`. Миграция
  `AccountOpeningAt1762600000000` только добавляет колонку (`NULL` можно). Ставит её только
  `CompleteFirstLaunchUseCase`, на свои три счёта. В API у счёта новое поле `openingAt`: ISO-момент или `null`.
- Правило — `countsInBalance()` в `src/modules/account/domain/account.ts`:
  - запись раньше даты открытия в остаток не входит;
  - запись позже входит всегда. Запись на завтра, сделанная до запуска, тоже входит: деньги ещё не ушли;
  - в сам день открытия, если `opening_at` задан, входит только то, что записано с этого момента.

  Моменты сравниваются с точностью до секунды: так SQLite хранит `transactions.createdAt`. Записанное в ту же секунду,
  что и запуск, входит. Если момента записи нет или его не прочитать, запись дня открытия не входит: SQL ведёт себя
  так же, потому что `strftime` даёт `NULL`. Тот же SQL — `countsInBalanceSql` в
  `SqliteAccountRepository.balanceChanges`, и для записей, и для перемещений. Экран счёта ставит `countsInBalance`
  той же функцией, поэтому остаток и пометки не расходятся.
- Почему не другие варианты:
  - не `onboarded_at` из настроек: SQL остатка полез бы в таблицу UserModule, а правило задело бы счета, которые
    первый запуск не ставил;
  - не `accounts.created_at`: стартовую «Карту» создаёт первая запись из бота, то есть раньше запуска. `updated_at`
    тоже не годится — меняется при переименовании;
  - не момент вместо даты в `opening_date`: сломалось бы сравнение с датами записей и контракт API.
- Новый счёт (`POST /api/accounts`) создаётся без момента. Иначе «55$», перенесённые на новый долларовый счёт
  (FT-103), перестали бы входить в его остаток. Решение — за Шукуром.
- Тесты:
  - `tests/firstLaunch.test.ts`: запись и перемещение дня открытия, сделанные до запуска, в остаток не входят, после
    запуска — входят; остаток равен начальному плюс операции с `countsInBalance: true`; без `opening_at` считается
    как раньше;
  - `tests/countsInBalance.test.ts`: границы правила.

  Документы: `docs/pastel/money-model.md`, `docs/pastel/api.md`, `database-guide.md`, `modules.md`.

Проверка 2026-10-29:
- Под-чат проверки:
  - точечные откаты исправления краснят тесты (3 / 5 / 3 упавших);
  - SQL и домен сравнены на 196 сочетаниях форматов дат и моментов;
  - проверены полночь по Ташкенту и форматы моментов в настоящем бэкапе;
  - миграция на копии бэкапа: accounts 13, transactions 133, account_moves 4 на каждом шаге, хэш остатков всех 13
    счетов совпал;
  - живой сценарий по API: кофе, записанный до запуска, в остаток не вошёл; проверены правка даты и повторный запуск
    (409);
  - у старых пользователей без момента остаток считается как раньше;
  - `verify` зелёный.
- Под-чат разработки:
  - миграция на копии `before-seed-removal-20261026-140811.sqlite`: `show` → `run` → `revert` → `run`, число строк не
    менялось, у всех 13 счетов `opening_at` пуст;
  - вживую на порту 3100 без бота. До запуска — «кофе 25000», запуск с 500 000 наличными и 3 000 000 на карте, после —
    «обед 45000 картой». Итог: на «Карте» 2 955 000, у кофе `countsInBalance: false`, в истории и итогах все 3 записи;
  - `verify` зелёный на `d6e3f97` после слияния `main` с FT-151, FT-167, FT-150: Jest — 98 наборов, 1467 тестов
    и 1 пропущенный; Vitest — 122 файла, 1202 теста; сборка, fonts, tokens, dependency-cruiser, madge.

Известно:
- Запись «задним числом» про утро, сделанная после запуска, войдёт в остаток дважды: у записи есть дата и момент
  записи, но не время траты.
- Существующим счетам `opening_at` не проставлен: их день открытия считается целиком, как раньше. Проставить
  (backfill) — только с «да» Шукура.

---

### FT-170: dev:miniapp writes a wrong WEB_APP_URL when the quick tunnel fails

Status: done
Priority: low
Owner: Claude Code, QA — под-чат проверки
Type: bug
Size: S

Context:
2026-10-28 без сети `cloudflared` ответил «failed to request quick Tunnel: Post "https://api.trycloudflare.com/tunnel":
context deadline exceeded», и `scripts/dev-miniapp.js` записал в `.env.local` `WEB_APP_URL=https://api.trycloudflare.com`
— адрес из текста ошибки, а не туннеля; затем вышел на «Request timed out: api.telegram.org». Следующий удачный запуск
перезаписал адрес, но кнопка меню могла уйти на неверный адрес. После переезда (FT-159) `dev:miniapp` нужен только для
разработки на маке.

Definition of Done:
- [x] Адрес туннеля берётся только из строки об успешной регистрации (`https://<slug>.trycloudflare.com`, не `api.`)
- [x] При ошибке `.env.local` и кнопка меню не меняются, сообщение понятное
- [x] Тест на разбор вывода `cloudflared`

Реализовано 2026-10-29 (`940d0dc`, `2403166`, `c41cc60`, PR #117):
- Причина: старая регулярка брала любой `https://*.trycloudflare.com` из любого куска вывода, и адрес API из строки
  ошибки становился адресом туннеля.
- `tunnelUrlFrom()` берёт первый `https://<slug>.trycloudflare.com` без `api.` после строки
  `Your quick Tunnel has been created!`. Читает весь вывод с начала, а не отдельный кусок: рамка может прийти по строкам.
- `openTunnel()` бросает ошибку раньше, чем трогаются env-файл и кнопка меню, если `cloudflared` завершился, не
  запустился или за 45 с не назвал адрес. В тексте — последняя строка `cloudflared`, подсказка про сеть и что
  `WEB_APP_URL` и кнопка не менялись. `waitForOutput` ждёт `'close'`, а не `'exit'`, чтобы строка с ошибкой успела
  прочитаться. Готовность сервера идёт через тот же помощник, поведение прежнее.
- Путь после сна открывает туннель той же `openTunnel()`: пока туннель не поднялся, env-файл и кнопка прежние, в логе
  `Could not bring the tunnel back: <причина>. Next attempt in 30 s.`
- По проверке: тест тайм-аута больше не ждёт первую строку подставного `cloudflared` за 300 мс (на маке флейкал
  ~1,3%); с `--no-menu` после восстановления пишется, что кнопку не трогали; запрос к Telegram без ответа падает с
  «Telegram is out of reach — is the network up? (…)» без адреса с токеном; в `quick-start.md` 45 с — срок назвать адрес.
- Тесты в `tests/devMiniapp.test.ts` на выводе `cloudflared 2026.9.3`, снятом 2026-10-29 (с сетью и с исходящими
  соединениями, закрытыми `sandbox-exec`), и на строке инцидента 2026-10-28: разбор, `openTunnel` с подставным
  `cloudflared`, полный `run` без сети (env-файл побайтно тот же, до кнопки дело не дошло), Telegram без ответа.
  Документы: `quick-start.md` (шаги 1 и 5), `troubleshooting.md`.

Проверка 2026-10-29:
- Под-чат проверки: возврат старой регулярки роняет тесты. Границы разбора: куски посреди slug и домена, `api.` до
  рамки, два адреса, `\r\n`. Настоящий `cloudflared` с сетью и в `sandbox-exec` без сети: env-файл не изменился, на
  `main` баг воспроизведён. Путь после сна с тремя попытками. `verify` зелёный. Найдено и исправлено в том же PR:
  флейк теста тайм-аута, «menu button updated» при `--no-menu`, формулировка про 45 с.
- Под-чат разработки: настоящий `cloudflared` без сети, `run --no-menu --no-serve --skip-build` с env-файлом во
  временной папке — понятная ошибка, файл не изменился; с сетью `openTunnel()` взяла настоящий адрес туннеля. Кнопку
  меню Telegram не трогали. `verify` на `5eed63b` (после слияния `main` с FT-151, FT-167, FT-150) — Jest 97
  наборов, 1465 + 1 skipped; Vitest 122 файла, 1202; сборка, fonts, tokens, dependency-cruiser, madge.

Известно:
- Туннель поднят, а Telegram недоступен: `WEB_APP_URL` уже записан с верным адресом, кнопка осталась старой — не менялось.
- Разбор опирается на фразу `Your quick Tunnel has been created!`; проверено на `cloudflared 2026.9.3` (мак).

---

### FT-166: Refused Telegram updates do not flood the log

Status: done
Priority: low
Owner: Claude Code, QA — под-чат проверки
Type: reliability
Size: S

Context:
Замечание к FT-153 (2026-10-27): каждое отклонённое обновление бота и каждый отклонённый запрос API пишут строку
`warn` без ограничения. Кто-то, кто засыпает бота сообщениями, наполнит journald на ПК. Отклонённые запросы к API не
доходят до лимитеров маршрутов: 403 приходит раньше.

Definition of Done:
- [x] Отказы одному Telegram id пишутся в лог не чаще раза в N минут, с числом пропущенных; тест
- [x] Первый отказ новому id виден в логе сразу (чтобы было видно, кого отсекли)

Реализовано 2026-10-29 (`7bd962b`, `f69242e`, `bfe0254`, PR #118):
- Один помощник на оба пути — `createRefusalLog` (`src/shared/infrastructure/logging/refusalLog.ts`): им пишут
  `allowedUsersOnly` (бот) и `createAllowedUsersMiddleware` (API), раньше оба писали одну и ту же строку `warn`.
  Первый отказ id — строка сразу, с прежними сообщением и полями (`telegramId` и `updateType` или `path`): видно, кого
  отсекли, по ней же находится свой id. Повторы того же id за окно считаются и не пишутся. Окно кончилось — одна
  строка `<сообщение> (repeats)` с `{telegramId, skipped, windowMinutes}`, и с неё отсчитывается следующее окно: поток
  остаётся строкой за окно. Окно с одним отказом сводки не даёт. Id числом и строкой — один id, отказы без id
  считаются вместе.
- N = 10 минут — константа `REFUSAL_LOG_WINDOW_MS`, не переменная окружения. Кто пишет без остановки, даёт не больше
  6 строк в час на id вместо строки на сообщение, а поток виден в первые 10 минут. При 1 минуте вышло бы около 1440
  строк в сутки на id, при часе поток долго оставался бы незамеченным. Другое значение живому экземпляру не нужно.
- Предел — 1000 id в памяти (`REFUSAL_LOG_MAX_IDS`): `Map` в порядке последнего отказа, несколько сотен КБ. Сверх
  предела забывается id, которому отказывали раньше всех; сначала уходит его `(repeats)`, и таймер снимается. Личный
  экземпляр отсекает считанных чужих, так что предел нужен только против потока разных id. Таймеры сводок `unref()` —
  остановку процесса не держат.
- Кого пускать и ответы не изменились: те же `allows()`, тот же `403 ACCESS_NOT_ALLOWED`, бот молчит.
- Тесты: `tests/refusalLog.test.ts` (16, среди них граница окна, цепочка окон, опоздавший таймер, предел по умолчанию
  и число таймеров — граничные тесты из проверки), новые случаи в `tests/telegramAllowedUsers.test.ts` (настоящий бот:
  50 сообщений — одна строка, второй чужой — сразу; сводка `skipped: 49` на фейковых таймерах) и
  `tests/allowedTelegramIds.test.ts` (настоящий сервер: 50 запросов — все `403`, одна строка; сводка на фейковых
  таймерах). До исправления новые тесты падали: 50 строк вместо одной. Документы: `troubleshooting.md` (раздел «Who was
  turned away by `ALLOWED_TELEGRAM_IDS`»), `live-instance.md`, `quick-start.md`, `api-lifecycle.md`,
  `auth-user-resolution-boundary-matrix.md`.
- Вживую: `node dist/index.js` на 3100 без бота, `ALLOWED_TELEGRAM_IDS=111`, без `.env.local` и настоящих ключей.
  51 запрос `X-Dev-User-Id: 900000143` — все `403`, `900000144` — `403`, `111` — `200`. В логе: строка про
  `900000143` в 10:32:05, про `900000144` в 10:32:06, `(repeats)` `900000143` `skipped: 50` в 10:42:05.

Проверка 2026-10-29:
- Под-чат проверки: откат middleware краснит 4 новых теста при зелёных 28 тестах FT-153; 8 мутантов помощника.
  Пропущенные (`maxIds ?? Infinity`, `<=` на границе окна, таймер без `clearTimeout` у забытого id) закрыты граничными
  тестами — каждый краснит `tests/refusalLog.test.ts`. 1000/1001 id и число таймеров (1000 → 999 → 0), граница окна,
  `--detectOpenHandles` чисто.
- Живой сервер с настоящим ожиданием 10 минут: первые строки 222 и 333 сразу, `(repeats)` у 222 с `skipped: 50` ровно
  через 10:00, у 333 сводки нет. Доступ и ответы не изменились.
- `npm run verify` зелёный.

Известно:
- Счётчики живут в процессе: сводки, не вышедшие до остановки, в лог не попадают; после перезапуска первый отказ id
  снова пишется сразу.
- В dev `requestLogger` пишет две строки `debug` на каждый отказ — вне FT-166; при `LOG_LEVEL=info` (по умолчанию) их
  не видно.
- Бот и API считают отдельно: чужой в обоих получает до строки за окно в каждом.

---

### FT-146: Show progress while a phrase is being parsed

Status: done
Priority: medium
Owner: Claude Code, QA — под-чат проверки
Type: quick-action-ui
Size: S

Context:
Замечание Шукура при проверке на телефоне: после отправки фразы кажется, что ничего не происходит. Пользователь
остаётся на главной; поле становится `readOnly`, круглая кнопка — серой (`ComposerView.tsx:127`, `:150-156`), и всё:
ни индикатора, ни текста. Проверка записей `/review` открывается только после ответа сервера
(`useSendCapture.ts:69`, `:86`). С ИИ это 2–5 с, при сбое — до таймаута (FT-145). У запроса нет таймаута и на
клиенте (`mutations.ts:51-56`, `client.ts:85-89`).

Definition of Done:
- [x] Во время разбора видно, что идёт работа (индикатор в кнопке или строка «Разбираю…» — по холсту; если состояния ожидания на досках нет — согласовать с Шукуром), с `aria-live` — состояния на досках нет; по решению 2026-10-29 экран сделан без макета по дизайн-системе
- [x] Ожидание ограничено на клиенте; по истечении — понятный тост, фраза остаётся в поле
- [x] Тест компонента: состояние ожидания и выход по таймауту
- [x] Скриншоты на 390px в светлой и тёмной теме

Реализовано 2026-10-29 (`8ad1a4e`, `8856cd9`, `8d005fe`, PR #119):
- **Состояние ожидания** (`ComposerView.tsx`):
  - в поле вместо камеры и «Ввести вручную» — «Распознаю…» (`type-label`, `ink-muted`), слово из строки «Распознаю»
    доски «Голосовой ввод». Это `role="status"` с `aria-live="polite"`: область есть на странице с начала и пустая,
    поэтому смена объявляется. Поле не меняет размер;
  - круглая кнопка остаётся `primary`: по Button.md серый значит «чего-то не хватает», а здесь приложение занято.
    Вместо стрелки три точки по очереди мигают (`waiting-pulse`, при `prefers-reduced-motion` неподвижны). Для
    скринридера подпись кнопки — «Распознаю…»;
  - фраза остаётся `ink`. Длинная кончается многоточием (`text-overflow` поля), перед «Распознаю…» зазор. Маску с
    прозрачностью не брали: в «Пастели» градиенты запрещены.
- **Таймаут на клиенте — 45 с** (`QUICK_CAPTURE_TIMEOUT_MS`, `mutations.ts`). Худший ответ сервера — около 41 с:
  `OPENAI_TIMEOUT_MS` 20 с, пауза SDK, ещё одна попытка 20 с (FT-145). Медленный ИИ поэтому кончается ответом сервера.
  Сдаться клиент может, только если сервер не ответил вовсе.
  - Тост «Не дождался ответа · Текст остался в поле — отправьте ещё раз»; фраза в поле, фокус возвращается в поле.
  - Перечитываются запросы записей (`capturedRecordKeys`, общие с инвалидацией захвата): сервер мог записать.
  - Повтор той же фразы идёт с тем же `clientId` (FT-106).
- **`apiClient`.** Запрос, оборванный по `timeoutMs`, отклоняется с `code: 'REQUEST_TIMEOUT'` и прежним
  `statusCode: 0`. Офлайн-очередь (FT-129) по-прежнему считает его «нет ответа»; тосты различают «Нет связи с
  сервером» и «Не дождался ответа».
- `send()` в `useSendCapture` сообщает, чем кончился: `review`, `on-device`, `kept`, `timed-out`, `skipped`.
- Тесты:
  - `ComposerView.test.tsx` — разметка ожидания;
  - `Composer.test.tsx` — jsdom, настоящая мутация, подменённый `fetch`. Ожидание видно сразу; кончается при ответе,
    при 502 и по таймауту; ответ на 42 с ещё открывает проверку; после таймаута фокус в поле;
  - `useSendCapture.test.tsx` — тост таймаута, перечитывание записей, тот же `clientId`;
  - `client.test.ts` — пометка таймаута.
- Документы: `docs/pastel/components/Composer.md` — состояние ожидания и тост таймаута.

Проверка 2026-10-29:
- Под-чат проверки:
  - откат реализации краснит тесты (8 / 1 / 3), прогоны 5×40 из 40;
  - настоящий сервер с моком ИИ: сценарии A и C — 1 запись и 1 вызов ИИ, офлайн и обрыв сети различаются;
  - сценарий D при таймауте 30 с — две записи, если фразу поправили и отправили снова. Отсюда 45 с;
  - раскладка 294×56 не дёргается, подписи переживают +30%.
- Под-чат разработки: `verify` на `8d005fe` — Jest 97 наборов, 1457 + 1 skipped; Vitest 122 файла, 1222; сборка,
  fonts, tokens, dependency-cruiser, madge. Скриншоты 390×844 в светлой и тёмной теме — с ветки, Chrome через
  Playwright, запрос `/api/quick-capture` задерживал тест:
  - до отправки;
  - во время разбора с длинной фразой;
  - после таймаута 45 с.

Известно:
- Проверить на iPhone в Telegram: «Распознаю…» и точки видны, пока не откроется проверка.
- Если после таймаута поправить фразу и отправить, это новый `clientId`. С 45 с таймаут значит «сервер не ответил»,
  поэтому поздних записей от первой отправки быть не должно.

---

### FT-147: Note field squeezed by the keypad in manual entry

Status: done
Priority: medium
Owner: Claude Code, QA — под-чат проверки
Type: quick-action-ui
Size: S

Context:
Замечание Шукура при проверке на телефоне. Экран `/add` — колонка высотой `100dvh` (`ManualEntryView.tsx:95`).
Шапка, сумма, цифровая клавиатура (216px, `keypad.tsx:35-43`) и кнопка «Сохранить» фиксированы — около 485px,
520px с чипом пересчёта. Счёт, категория и заметка делят остаток в прокручиваемой области (`:129`), заметка — внизу
(`:190-201`). На телефоне, особенно когда системная клавиатура уменьшает `dvh`, заметку сжимает или уводит за край.
Цифровая клавиатура при фокусе на заметке не прячется; `visualViewport` нигде в webapp не учитывается.

Definition of Done:
- [x] Пока заметка в фокусе, она видна целиком над системной клавиатурой (прятать цифровую клавиатуру или вынести заметку из прокрутки — по холсту)
- [x] На 375×640 и 390×844 все поля доступны без перекрытий; скриншоты
- [x] Тест: фокус на заметке меняет раскладку

Реализовано 2026-10-29 (`9fe58f9`, `954c051`, `ff4008b`, `4c693d3`, `ec5563a`, `ee410cf`, PR #120). Доски на холсте
нет: FT-146…FT-149 делаются по «Пастели», Шукур принимает по скриншотам (решение 2026-10-29).
- **Режим заметки по фокусу.** Пока строка заметки (поле или её «Готово») в фокусе, `ManualEntryView` оставляет шапку,
  сумму и заметку. Счета, категории, цифровая клавиатура и «Сохранить» убираются, заметка встаёт под сумму (низ поля —
  257 px от верха), справа от неё — «Готово» (таблетка 48 px, `primary`). Слово «Заметка» в поле на это время остаётся
  только для экранного диктора: рядом с «Готово» пример «Например, супермаркет» иначе обрезается на 390 px. Поле не
  меняет места в дереве React, поэтому фокус и клавиатура телефона не теряются, пока экран перестраивается.
- **Выход.** «Готово», Enter («Готово» на клавиатуре телефона) или уход фокуса возвращают экран. Tab с поля на «Готово»
  режим не закрывает (`relatedTarget` внутри строки), нажатие «Готово» не забирает фокус до клика. Enter, который
  подтверждает слово метода ввода, заметку не закрывает: `isComposing`, а для Safari — `keyCode 229`.
- **Прокрутка.** Если заметку закончили сами (фокус ушёл в никуда: «Готово», Enter, тап мимо поля), списки сдвигаются
  ровно настолько, чтобы заметку было видно — как `block: 'nearest'`, но только внутри списков и до отрисовки. Если
  фокус забрала другая кнопка («Доход», дата), списки остаются вверху: следующий шаг там.
- **Почему по фокусу, а не по высоте клавиатуры.** `visualViewport` и `Telegram.WebApp.viewportHeight` в webapp никто
  не читает; на iOS и Android они ведут себя по-разному, а `dvh` на iOS при открытой клавиатуре не меняется. Фокус
  одинаков везде, второй механизм замера не нужен.
- **Почему не шторка.** Это лишнее нажатие, шторка сама стоит снизу, а программный фокус в новой шторке на iOS
  открывает клавиатуру ненадёжно; здесь поле получает фокус от касания. Спрятать только цифровую клавиатуру мало: в
  Telegram на iPhone заметка под списками стояла бы на ~490 px, под клавиатурой телефона.
- **Это упрощение режима заметки карточки операции** (TxnSheet.md): там «Назад», заголовок и «Готово» в одной строке и
  поле под ними, здесь только «Готово» справа от поля. Записано в `docs/pastel/design-vs-code.md`, «Ручной ввод».
- Тесты: `ManualEntryView.note.test.tsx` (jsdom, 12) — раскладка до фокуса и в фокусе, выход тремя путями, Tab (blur
  и focus в разных `act`), `mousedown` на «Готово», IME двумя способами, прокрутка после «Готово» и Enter и её
  отсутствие после ухода на дату. Первая версия теста была красной: 6 из 8. Старые тесты экрана не менялись.
- Правки по проверке (`ec5563a`, `ee410cf`): тест Tab не ловил поломку — blur и focus сливались в одном `act`, теперь
  без проверки `relatedTarget` он красный; `keyCode 229` для Safari; прокрутка только при выходе с самой заметки и на
  минимальный сдвиг (было — к концу списков при любом выходе, и на 375×640 выбранный счёт уходил из вида); в коде и
  доках — «упрощение режима заметки», а не «как TxnSheet». Каждая из трёх правок проверена подменой: без неё тест
  красный.
- Экраны (под-чат разработки; Playwright и Chrome, `api` 3100 и `webapp` 5174 из копии ветки, обе темы): 390×844,
  375×640, 390×667 — до фокуса, в фокусе и после «Готово»; окно, сжатое клавиатурой, 390×450 и 375×340; окно Telegram
  на iPhone 390×740 и на SE 375×590 с наложенной клавиатурой iOS ≈380 и ≈304 px — низ заметки 257 px, верх клавиатуры
  360 и 286 px.

Проверка 2026-10-29:
- Под-чат проверки: «можно мержить», блокеров и серьёзных нет. Подмены кода краснят тесты, кроме Tab — исправлено
  (см. выше). Сценарии Playwright в Chrome: «Готово», Enter, тап мимо поля, заметка первой, счёт и сумма сохраняются,
  «Доход» в режиме заметки; `GET /api/transactions` — заметки в записях. Нажатие сквозь экран: тап «Готово» не
  нажимает то, что встаёт на его место. Доступность: Tab и Shift+Tab, «Готово» 88×48. IME через CDP. Скриншоты
  390×844 и 375×640 в обеих темах и с подписями +30%.
- Под-чат разработки: `verify` на `ee410cf` (последний код, `main` с ветки не уходил) — Jest 97 наборов, 1457 + 1 skipped;
  Vitest 123 файла, 1214; сборка, fonts, tokens, dependency-cruiser, madge.

Известно:
- Только на iPhone в Telegram (Шукур, при приёмке): не сдвигает ли iOS страницу вверх, когда открывается клавиатура
  (шапка на месте); запас над клавиатурой на SE и mini; тап «Готово» не проходит на плитку «Доллары», которая встаёт на
  его место; тап по пустому месту закрывает режим; клавиша «Готово» на клавиатуре; Android — окно сжимается, режим тот
  же.
- Если клавиатуру закрыть, а фокус останется в поле (Android «Назад»), режим держится — выход одним нажатием «Готово».
- Пока заметка в фокусе, «Сохранить» нет: на компьютере, если заметку пишут последней, перед сохранением нужен Enter
  или «Готово». На телефоне «Сохранить» и раньше была под клавиатурой.
- На 375×640 область списков около 150 px: до фокуса к заметке нужно докрутить (так с FT-113).
- В Safari и WebKit нажатие кнопки может не передать ей фокус — тогда выход считается «в никуда» и списки сдвигаются к
  заметке. Вреда нет.

---

### FT-149: Choose the default account

Status: done
Priority: medium
Owner: Claude Code, QA — под-чат проверки
Type: feature
Size: S

Context:
На backend настройка есть: `default_account_id` (`UserSettings.ts:34-35`), `PATCH /api/settings {defaultAccountId}`
с проверкой, что счёт видимый (`userSettingsUseCases.ts:47-61`, `:124-127`). Новые записи идут на него, иначе на
первый видимый счёт (`accountBook.ts:115-117`). В webapp поле только читается (ручной ввод, чипы, офлайн, отправка
фразы) — выбрать его негде. Сейчас счёт по умолчанию зависит от порядка счетов.

Definition of Done:
- [x] Место выбора — по холсту; если доски нет — решение Шукура до реализации. Доски нет; по решению 2026-10-29
      экраны FT-146…FT-149 делаются по «Пастели» и принимаются по скриншотам: строка в «Ещё» → «Деньги»
- [x] Выбор вызывает `PATCH /api/settings` и сразу действует в ручном вводе, чипах и фразах; тест
- [x] Скрытый счёт выбрать нельзя; если скрывают счёт по умолчанию — записи идут на первый видимый, и экран это показывает; тест

Реализовано 2026-10-29 (`3d00685`, `04527e3`, `df03007`; по проверке `a2bdaec`, `ec4073c`; по решению о сумах `e85c77f`,
`a688d49`, `a53d00a`; PR #121):
- Место выбора — строка «Счёт по умолчанию» в «Ещё» → «Деньги», под «Счета и курс доллара» (`features/default-account`).
  Почему там: «Пастель» держит настройки в «Ещё», строка говорит состояние и меняется сразу (SettingsList.md); на досках
  «Счета» строки-настройки нет, а экран счёта трогает FT-148. Шторка — выбор счёта из Picker.md (`AccountPicker`):
  видимые счета в сумах с остатком, текущий отмечен; нажатие шлёт `PATCH /api/settings {defaultAccountId}`, закрывает
  шторку и сразу видно в подписи. Иконка строки — тип счёта (купюра, карта), как в AccountList.
- Подпись строки — счёт, на который сейчас идут записи в сумах без названного счёта: «Карта», «Наличные · первый в
  списке» (ничего не выбрано или выбранного нет), «Карта · счёт «Наличные» скрыт», «Наличные · счёт «Доллары» не в
  сумах». В шторке под списком — та же причина и правило: «Сюда пойдут новые записи в сумах, если в них не назван другой
  счёт: «нал», «картой»; записи с «$» — на счёт в долларах.»
- Только счёт в сумах (решение Шукура 2026-10-29, `decisions.md`): запись с «$» и так идёт на долларовый счёт по валюте.
  Сервер: `accountBook.canBeDefaultAccount` (видимый и в сумах) вместо `isVisibleAccount`; долларовый — `400`
  «defaultAccountId must be one of your visible accounts in сум». Клиент: `defaultAccountOptions` и
  `defaultRecordAccount` в `entities/account` — выбранный, пока он видимый и в сумах, иначе первый видимый в сумах.
  Долларовый, сохранённый раньше, остаётся в настройке; записи в сумах идут на первый видимый в сумах (так уже делал
  `resolveForRecord` по валюте — теперь закреплено тестом).
- Выбор действует сразу: настройки в кэше берут его до ответа, поэтому ручной ввод, стартовые чипы и фраза без связи
  пишут на него сразу; фразу онлайн разбирает сервер по сохранённой настройке. Частые чипы — счёт прошлой такой записи
  (FT-114), решение 2026-10-29.
- По проверке: отказ сервера (`400`, счёт скрыли или удалили на другом устройстве) — Toast «Этот счёт больше нельзя
  выбрать · Его скрыли или удалили — выберите другой» и счета перечитываются; нет ответа — «Не получилось сменить счёт ·
  Проверьте связь…». Гонка двух быстрых нажатий в `useUpdateSettings`: нажатия, сделанные до ответа на прежние, — одна
  цепочка; ошибка возвращает только поля, которые не поменяет следующий ждущий запрос, и к тому, что на сервере
  (последний ответ в цепочке или прочитанное до неё); ошибка, которую перекрывает следующее нажатие того же поля, молчит.
  Заодно упавшая смена темы больше не стирает следующую смену другой настройки.
- Документация: `docs/pastel/api.md` (кто пишет и кто читает `defaultAccountId`, поле — только счёт в сумах),
  `docs/pastel/design-vs-code.md`.

Проверка 2026-10-29:
- Под-чат проверки: блокеров нет; откаты кода краснят тесты (14, 5, 6, 1 и 8 упавших по мутациям). Вживую: выбор в
  webapp → «кофе 25000» на выбранный счёт; скрытие → первый видимый; `PATCH` скрытого → `400`; ошибки `400`, `500`,
  обрыв, гонка двух нажатий и офлайн; подписи переживают +30% на 375 px. Находка о долларовом счёте ушла Шукуру и
  решена: только сумы.
- Под-чат разработки: вживую (api :3100, webapp :5174, пользователь 900000143, счета Карта, Наличные, Доллары) —
  «Наличные» выбраны в «Ещё» → `POST /api/quick-capture` «кофе 25000» → «Наличные»; «Наличные» скрыты → «такси 18000»
  → «Карта», строка «Карта · счёт «Наличные» скрыт»; после правила сумов `PATCH` с «Долларами» → `400`, в шторке только
  Карта и Наличные; долларовый счёт по умолчанию, записанный в базу копии, → «кофе 25000» на «Карта», «кофе 5$» на
  «Доллары», строка «Карта · счёт «Доллары» не в сумах». Скриншоты 390 px в светлой и тёмной теме — в отчёте под-чата.
  `verify` зелёный: до правок Jest 1457 + 1 skipped, Vitest 1225; после правила сумов Jest 1459 + 1 skipped, Vitest 1239;
  со свежим `main` (FT-164) — Jest 98 наборов, 1483 + 1 skipped, Vitest 126 файлов, 1239; сборки, dependency-cruiser и madge чистые.

Известно:
- Выбор без сети пропадёт, если закрыть Mini App до связи: смена настроек не стоит в очереди отправки (FT-129).
- `entryAccountId` (`features/manual-entry/model/manualEntry.ts:104-107`) дублирует `defaultRecordAccount` и не знает
  правила сумов: при долларовом счёте по умолчанию, сохранённом до FT-149, ручной ввод открывается на нём. Свести после
  FT-147.

---

### FT-165: Application-layer logs without time and level

Status: done
Priority: low
Owner: Claude Code, QA — под-чат проверки
Type: tech-debt
Size: S

Context:
Найдено при проверке FT-144 (2026-10-27): строки планировщиков итогов и напоминаний в живом логе идут без времени и
уровня. `getLogger` на уровне модуля вызывается при импорте, раньше `registerLoggerFactory` (`src/index.ts:15`), и
навсегда возвращает консольный запасной логгер — так в 38 файлах `src/modules/*/application`. Разбирать сбои на ПК
по journald без времени трудно. Заодно две мелочи FT-145: на пути «простая фраза» в лог идёт только
`External service error`, без причины (`processTextInput.ts:607` логирует `.message`, а не `context.originalError`), и
пример «такси 18000» в `docs/knowledge-base/07-data-flow/voice-to-transaction.md:307` неверен — «такси» пишется в
«Транспорт» без ИИ.

Definition of Done:
- [x] Логгер слоя application разрешается лениво (при вызове) или фабрика регистрируется до импорта модулей; тест на порядок
- [x] Строки `Daily summary …` и `Reminder …` в логе сервера идут с временем и уровнем — проверено на запуске
- [x] Сбой ИИ на простой фразе пишет в лог причину («Request timed out.»)
- [x] Пример в `voice-to-transaction.md` исправлен
- [x] (добавлено штабом по проверке) `LOG_LEVEL` и `NODE_ENV` из `.env.local` / `.env` доходят до логгера; тест

Реализовано 2026-10-29 (`4946f8b`, `f9fbe44`, `0ed3ccb`, `641e133`, `22fbfae`, PR #122):
- **Причина — замер порядка модулей.** `src/index.ts` регистрирует фабрику Winston в теле модуля, после всех
  `import`. Проба `Module._load` на `dist/index.js` показала: до `registerLoggerFactory` вычисляется 333 модуля
  проекта, среди них `dailySummaryNotifier` (#71), `processTextInput` (#255), `fxRateService` (#303),
  `remindersNotifier` (#310). Каждый на импорте берёт `const logger = getLogger(…)` и получал запасной
  `console`-логгер насовсем. Так во всех 39 файлах `src/modules/*/application` (в задаче насчитано 38); delivery и
  infrastructure берут Winston напрямую, у них время было.
- **Ленивый `getLogger`.** Логгер ищет фабрику при каждой записи, кеша нет — фабрика собирает маленький объект поверх
  одного экземпляра Winston. Регистрацию раньше импортов не переносили: она держится, только пока никто не
  импортирует application-файл раньше. Запасной логгер решает «молчать в Jest» один раз при загрузке
  (`SILENT_IN_TESTS`), как Winston решает `silent` — правка по проверке.
- **Причина сбоя ИИ.** `errorFields()` в `src/shared/application/logging`: `warn` на пути «простая фраза»
  (`processTextInput.readByAI`) пишет `error` и `errorContext` — то же поле, что `logger.error` пишет для `AppError`,
  и под тем же `sanitizeContext`.
- **Пример в доке.** `voice-to-transaction.md`: «стрижка 50000» вместо «такси 18000» («такси» — «Транспорт» без ИИ) и
  строка лога, которую фраза оставляет.
- **Env до логгера** (добавлено штабом по проверке). `logger.js` вычислялся 14-м, `appConfig.js` с `dotenv` — 21-м:
  `LOG_LEVEL` и `NODE_ENV` из `.env.local` логгер не видел. `loadEnvironment()` вынесен в
  `src/shared/infrastructure/config/loadEnvironment.ts` и загружает файл один раз; его первым импортируют
  `appConfig.ts` и `logger.ts`. Переменные процесса по-прежнему главнее; строка «Environment variables loaded …» —
  одна. Доки: `CLAUDE.md` (env file policy, `LOG_LEVEL` по умолчанию), `quick-start.md`, `troubleshooting.md`.
- **Шум в Jest.** `tests/helpers/appConfigWith.ts` глушит и `console.warn` «No .env.local or .env file found» — в
  копии и в CI env-файла нет; это было и до FT-165.
- Тесты: `tests/applicationLogging.test.ts` — логгер взят до регистрации и пишет через фабрику; `Ticker`, импортированный
  до регистрации, как в `index.ts`; запасной логгер молчит в Jest после смены `NODE_ENV`, с `TEST_LOGS=true` пишет
  `[CATEGORY] …`; сбой ИИ на «стрижка 50000» пишет `errorContext.originalError`. `tests/loggerEnvironment.test.ts` —
  `LOG_LEVEL` из `.env.local` и из `.env` доходит до `winstonLogger.level`, процесс главнее файла, строка о загрузке
  одна. Все красные до своих исправлений.
- Вживую, порт 3100: бот с фиктивным токеном через локальную заглушку Telegram (`sendMessage` — 400), OpenAI —
  фиктивный ключ и `OPENAI_BASE_URL` на молчащий локальный порт (`OPENAI_TIMEOUT_MS=1500`). До — `[TELEGRAM] Daily
  summary not sent { … }` без времени; после — `12:49:19 warn [TELEGRAM] Daily summary not sent {…}`,
  `12:49:19 warn [TELEGRAM] Reminder not sent {"kind":"goal_over",…}`, `12:48:32 warn [OPENAI] The AI could not read a
  simple phrase; its label is kept {"errorContext":{"originalError":"Request timed out."}}`. С `NODE_ENV=production`
  и `LOG_LEVEL=warn` только в `.env.local`: `/api/health` — `production`, лог — JSON, только `warn`.

Проверка 2026-10-29:
- Под-чат проверки: откат к eager-разрешению — 3 из 5 тестов красные; живые строки
  `13:11:58 warn [TELEGRAM] Daily summary not sent`, `13:02:33 warn [OPENAI] … Request timed out.`; замер — 631 и
  644 нс на вызов (1 млн вызовов, один транспорт), разница в пределах шума; ключ и текст фразы в `errorContext` не
  попадают. Найдено и исправлено в том же PR: запасной логгер печатал в Jest 13 строк `[TRANSACTION] …` под
  `NODE_ENV=production` в `shortcutCaptureOwner.test.ts`; тест «does not throw» ничего не ловил при откате — заменён;
  Winston создавался раньше загрузки `.env` (`/api/health` — production, а лог цветной с debug).
- Под-чат разработки: `verify` после слияния `main` (FT-163, FT-170, FT-166) — Jest 102 набора, 1529 + 1 skipped;
  Vitest 122 файла, 1202; сборка, fonts, tokens, dependency-cruiser (336 модулей), madge. В выводе Jest нет строк
  логгеров приложения, остался только вывод TypeORM (`query failed`, ожидаемый отказ миграции в тесте).

Известно:
- Ошибки запросов TypeORM идут через `console.log` с `PARAMETERS` — вне задачи.
- «Environment variables loaded from …» печатается через `console`: логгера ещё нет.
- `scripts/run-migration.ts`, `create-tables.ts`, `simple-test.ts` загружают env своими копиями — не трогали.
- На ПК по `journalctl` вживую не смотрели: строки там изменятся после `scripts/live-update.sh`.

---

### FT-148: Mark records before the account's opening date

Status: done
Priority: low
Owner: Claude Code, QA — под-чат проверки
Type: quick-action-ui
Size: S

Context:
Остаток счёта считает записи и переводы с даты открытия (`SqliteAccountRepository.ts:60`, `:65`, `:70`;
`accountBook.ts:81`). Список операций счёта отдаёт и более ранние — с `countsInBalance: false`
(`accountOperations.ts:95`, `:108`, `:124`), но webapp это поле не читает (`entities/account/model/types.ts:76-77`,
`accountScreen.ts:109-123`, `AccountPage.tsx:45-71`). Ранние записи выглядят как обычные, и список не сходится с
остатком.

После FT-163 (PR #116) `countsInBalance: false` бывает по двум причинам: операция раньше даты открытия, и операция дня
открытия, записанная до момента первого запуска (`account.openingAt`). Правило одно — `countsInBalance()` в
`src/modules/account/domain/account.ts`. Поэтому метка общая — «не входит в остаток», без «до даты открытия».

Definition of Done:
- [x] Запись до даты открытия на экране счёта отмечена (вид — по холсту), понятно, что она не входит в остаток.
  Доски на холсте нет — по «Пастели», решение 2026-10-29
- [x] Тест `accountDays`: флаг доходит до строки
- [x] Скриншоты в светлой и тёмной теме

Реализовано 2026-10-29 (`1ab16b3`, `d669337`, `7c02688`, PR #123):
- На экране счёта запись и перемещение с `countsInBalance: false` помечены «Не входит в остаток». Метка одна на три
  причины: операция раньше даты открытия, операция дня открытия, сделанная до первого запуска (FT-163), запись в
  другой валюте. Правило одно — `countsInBalance()` в `src/modules/account/domain/account.ts`; webapp флаг только
  читает и сам не вычисляет. Метку ставит только `countsInBalance === false`: ответ без поля строки не помечает.
- Вид. Метка — первые слова подписи: «Не входит в остаток · кофе утром», 13px, `ink-muted`, вес 600 (как `label`);
  заметка после неё — вес 500. Новых цветов и иконок нет. Сумма и её цвет не меняются: серым в «Пастели» бывает только
  ещё не введённое число. «Без заметки» после метки не пишется. Диктор слышит «…, не входит в остаток. Открыть в
  истории». Тот же приём, что у «Ждёт связи» (OfflineBar.md): метка первой, многоточие её не режет.
- Когда не хватает места:
  - метка не режется: шире всей подписи — переносится на вторую строку, строка растёт от `min-h-row`;
  - заметка записи режется многоточием, а если рядом с меткой ей остаётся меньше 56px («· » и три буквы), не
    показывается вовсе — без одинокого «· …» (container query на блоке заметки);
  - у перемещения направление («Карта → Наличные») важнее: оно идёт своей строкой под меткой (строка 78px) и режется,
    только если шире всей подписи.
- Где. Только экран счёта: там список стоит под остатком и без метки с ним не сходится. В истории метки нет: там нет
  остатка, с которым сверять список; записи `/api/transactions` не несут `countsInBalance`, а вычислять его в webapp —
  третья копия правила FT-163 (домен и SQL) и `openingAt`, которого webapp не читает. Понадобится в истории — поле
  должен дать сервер.
- Когда помечено перемещение. Перемещение с датой раньше даты открытия API не принимает (`400`). Метку перемещение
  получает, если сделано в день открытия до первого запуска (FT-163) или если первый запуск перенёс дату открытия
  существующего счёта на сегодня: «Наличные» и Humo открыты 1 октября, перевод 15 октября, первый запуск ставит
  «Наличным» сегодня — на «Наличных» перевод помечен, на Humo входит в остаток.
- Код: `recordRow(…, { notInBalance })` и `RecordRow.notInBalance` (`entities/transaction/lib/recordDays.ts`),
  `NotInBalanceCaption` (`entities/transaction/ui/RecordDayList.tsx`), `MoveRow.notInBalance` и `accountDays`
  (`pages/accounts/model/accountScreen.ts`), `MoveRowItem` (`AccountPage.tsx`).
- Тесты:
  - `accountScreen.test.ts`: флаг доходит до строк записей (раньше даты открытия, день открытия до запуска, другая
    валюта) и перемещения; у остальных строк флага нет; ответ без `countsInBalance` ничего не помечает; подписи для
    диктора и «Без заметки»; начальный остаток плюс строки без метки равен `balanceMinor`;
  - `AccountPage.test.tsx`: метка перед заметкой у записи, направление перемещения — своей строкой без «·», у
    остальных строк метки нет.
- Документы: «В коде (FT-148)» в `docs/pastel/components/TransactionList.md` и `AccountMoves.md`; `design-system.md`,
  «Экран счёта» — чем записи экрана счёта отличаются от истории.

Проверка 2026-10-29:
- Под-чат проверки — «можно мержить», блокеров и серьёзных нет:
  - откат `accountScreen.ts` → 5 красных тестов, без вывода метки на экран → 1;
  - начальный остаток плюс операции без метки сходится с остатком на пяти счетах:

    | Счёт | Что проверяет | Начальный + без метки = остаток |
    |---|---|---|
    | Карта | счёт в сумах | 1 000 000 + 2 492 000 = 3 492 000 |
    | Наличные | перевод в обе стороны и старый перевод с меткой | 500 000 + 130 000 = 630 000 |
    | Доллары | счёт в долларах | 100,00 − 65,00 = 35,00 USD |
    | Humo | без `openingAt`: тот же старый перевод здесь без метки | 200 000 + 350 000 = 550 000 |
    | старый пользователь | утренняя запись дня открытия входит, метка только у записи до даты | 400 000 − 21 000 = 379 000 |

  - перенос даты записи и сброс кэша экрана счёта; «Открыть в истории» с помеченной строки; регрессий в истории и на
    главной нет;
  - +30% длины метки и 375px;
  - `verify` и CI зелёные.
  - Замечания, исправленные в `7c02688`: одинокое «· …» после метки, когда заметке нет места; направление перемещения
    резалось ради метки; `!countsInBalance` помечал строки и в ответе без поля; метки не было в `AccountMoves.md` и
    `design-system.md`.
- Под-чат разработки:
  - вживую на порту 3100 без бота, новый пользователь: до первого запуска «кофе утром 25к картой», «продукты 186400
    картой» и перевод Карта → Наличные 200 000; первый запуск (на карте 3 180 000); после — «такси 18к», «обед с
    командой 64к» и перевод Наличные → Карта 300 000; «продукты» перенесены на 26 октября. Начальный 3 180 000 +
    218 000 без метки = 3 398 000 — остаток на экране; три помеченные операции (−411 400) его бы сломали;
  - скриншоты 390px в светлой и тёмной теме; 375px с меткой на 30% длиннее: метка в одну строку (166px), заметки
    записей спрятаны (места 23 и 14px), направление перевода целиком; на +63% метка переносится и не режется;
  - `verify` зелёный после правок проверки: Jest — 99 наборов, 1491 тест и 1 пропущенный; Vitest — 122 файла, 1208
    тестов; сборка webapp (container query в CSS есть), dependency-cruiser, madge.

Известно:
- Метка у записи в другой валюте («55$» на сумовом счёте) не подсказывает, что делать — перенести запись на
  долларовый счёт. Продуктовый вопрос.
- Шапка «счёт добавлен сегодня» у счёта со старыми записями (первый запуск перенёс дату открытия на сегодня) — старая
  логика `openingText`, FT-148 её не трогал.
- Короткая заметка, которая влезла бы целиком в меньше чем 56px, рядом с меткой не показывается: порог один на все
  заметки.

---

### FT-162: Legacy :userId routes take the user from authentication

Status: done
Priority: low
Owner: Claude Code, QA — под-чат проверки
Type: security
Size: S

Context:
Пункт 4 раздела «Ещё ждёт вас» в `docs/pastel/handoff.md`. С 2026-10-21 чужой `userId` в теле, пути или строке
запроса получает 403 (`writeAsSignedInUser`, строгий `verifyOwnership`), так что дыры нет. Осталось: в старых
маршрутах с `:userId` (подписка — `subscriptionRoutes.ts`, бюджеты, долги, дашборд) `resolveUser` стоит до
`verifyOwnership` и создаёт строку пользователя для чужого id; `userId` числом или массивом даёт 500 вместо 400;
контроллер подписки берёт `req.body.userId` запасным путём (`subscriptionController.ts:104-105`). После FT-153 и с API
только в tailnet это не блокер (решение 2026-10-26). Делать вместе с FT-136 — она убирает гостевые ветки тех же
контроллеров (решение 2026-10-29: делается отдельно, FT-136 ждёт голоса и чеков).

Definition of Done:
- [x] Маршруты подписки и `POST /api/transactions` берут пользователя только из авторизации; `userId` в теле не читается
- [x] Где в пути ещё есть `:userId`, проверка владельца идёт до `resolveUser`; чужой id не создаёт строку в `users`; тест
- [x] `userId` не строкой — 400; тест
- [x] Матрица авторизации обновлена

Реализовано 2026-10-29 (`ec2d204`, `1e1fd28`, `7a7a7a7`, PR #124):
- **Проверка владельца до резолюции** на всех 22 старых маршрутах с `:userId` — транзакции ×8, бюджеты ×4, долги ×3,
  дашборд ×7 — и на `GET /api/subscription/:userId`: `allowGuestMode, verifyOwnership, resolveUser`. Отклонённый запрос
  никого не резолвит и строку в `users` не создаёт, в том числе для `0131184740` вместо `131184740`: резолюция завела бы
  его как нового пользователя.
- `verifyOwnership` проверяет **каждый** `userId` запроса — путь, query и тело, — а не первый найденный, и больше не
  читает `req.resolvedUser`, поэтому стоит первым. Чужой — `403 ACCESS_DENIED`. Число, массив (`?userId=a&userId=b`),
  объект, `null`, пустая строка или строка из пробелов — `400 INVALID_USER_ID`. Ту же проверку делает
  `writeAsSignedInUser` (quick capture, голос). Вторая линия: `createUserResolutionMiddleware` сама отвечает 400 на id не
  строкой — это закрывает admin `grant`, который называет цель в теле.
- **Пользователь из авторизации** у `GET /api/subscription/:userId`, `POST /check-limit`, `/cancel`, `/start-trial` и
  `POST /api/transactions`: `requireAuth, verifyOwnership, createResolveCurrentUserMiddleware` (половина
  `createCurrentUserMiddleware`, вынесена, чтобы проверка встала между входом и резолюцией), контроллер берёт
  `currentUserId(req)`. Запасные `req.body.userId` в `subscriptionController.ts` убраны; `userId` в теле или пути только
  проверяется. `POST /api/transactions` регистрируется только с `UserModule`, как `GET /`, `/totals`, `/frequent`.
- Почему так, а не «резолюция без создания для чужого id»: одно правило в одном месте перед любой резолюцией, нового
  режима резолвера нет, а `resolveUser` и `requirePremium` после проверки видят только свой id.
- **Изменение поведения:** свой `userId` **числом** на записи (`POST /api/transactions`, quick capture, голос) теперь
  `400`, раньше принимался — клиенты шлют строку. `check-limit`, `cancel` и `start-trial` без `userId` в теле работают за
  вошедшего, раньше отвечали `400 userId is required`.
- Тесты: `tests/legacyUserIdRoutes.test.ts` — 111 случаев через `tests/helpers/testServer.ts` на настоящей таблице
  `users`. По каждому старому маршруту: чужой id → 403 без новой строки; пустой, массив или не строка → 400; query или
  тело с чужим id рядом со своим путём → 403; свой id — как раньше, а use case получает свой UUID. Подписка и
  `POST /api/transactions`: свой пользователь без `userId` и со своим `userId` в теле или пути (use case получает
  `myUuid()`), чужой → 403 без строки и записи, не строка → 400; admin `grant` с целью числом → 400. Изменены случаи в
  `tests/userFromAuth.test.ts` (числом → 400, `?userId=a&userId=b` → 400) и `tests/idempotentCreate.test.ts` (роутер
  получил `UserModule`).
- Документы: `auth-user-resolution-boundary-matrix.md` (раздел FT-162, `verifyOwnership` и резолюция, строки матрицы,
  `GET /api/transactions` — история с FT-107), `api-route-coverage-matrix.md`, `docs/QUICK_CAPTURE_API.md` (400),
  `docs/pastel/handoff.md` (пункт 4 закрыт).
- Вживую (под-чат разработки): `main` на 3101 и ветка на 3100, у каждого свежая SQLite, бот выключен, `curl` с
  `X-Dev-User-Id: 131184740`. Чужой id, `0131184740`, `%20` и `?userId` дважды по 23 маршрутам: `main` —
  403 / 403 / **500** / 200 и 2 фантомные строки `users` (`0131184740`, `597843119`); ветка — 403 / 403 / **400** /
  **400** и 0 строк. Тело: `check-limit`, `cancel`, `start-trial` с `userId` числом `500 → 400`, без `userId`
  `400 → 200`; admin `grant` с целью числом `500 → 400`. Свой id на всех маршрутах — как раньше.

Проверка 2026-10-29:
- Под-чат проверки: новый набор на `main` красный — 82 из 127. Мутанты M1, M3–M7 краснят тесты. M2, M8–M10 (вернуть в
  `subscriptionController.ts` `req.body.userId || currentUserId(req)` для check-limit, start-trial, cancel или
  `req.params.userId` для status) выживали; добавлены случаи со своим `userId` в теле и пути и проверкой UUID в use case
  (`7a7a7a7`) — теперь каждый из четырёх краснит тест.
- Живой запуск в dev и в production: 18 чужих запросов → 403, строк `users` 1 → 1; 11 невалидных → 400. Клиенты —
  webapp, бот, Shortcut, голос — шлют `userId` строкой. `requireAdmin` без входа — 401; `X-Dev-User-Id` в production
  игнорируется.
- `npm run verify` зелёный.

Известно:
- `GET /api/transactions/analytics` и `/api/openai/usage*` — `requireAdmin` без `requireAuth`, всегда 401
  (fail-closed): FT-174.
- Лог отказа `Request naming another user refused` (`authMiddleware.ts:427`) не прорежен, как в FT-166: сюда доходят
  только разрешённые `ALLOWED_TELEGRAM_IDS`.
- Гостевая ветка `subscriptionController.ts:81` мёртвая: `currentUserId` всегда UUID. Убирает FT-136.
---

### FT-160: Action Button shortcut over Tailscale

Status: cancelled — 2026-10-29: Shortcut не делаем, его заменяет iOS-приложение FT-161 с очередью и готовыми командами (решение 2026-10-29). Проверка данных Wallet перенесена в FT-179; русский голос без сети проверяет FT-178
Priority: medium
Owner: Claude Code (инструкция), Shukur (iPhone), QA — под-чат проверки
Type: feature
Size: S
Depends on: FT-155, FT-159

Context:
Первый шаг быстрой записи с iPhone, без кода под iOS (решение 2026-10-26). Action Button запускает Shortcut: текст
или диктовка → `POST https://<пк>.<tailnet>.ts.net/api/quick-capture` с токеном владельца (FT-155) и `clientId` →
короткое уведомление с итогом. API есть с FT-075, `clientId` защищает от дублей при повторе. Если ПК выключен, фраза
ждёт в Telegram (путь FT-076) — но не дольше 24 часов: дольше Telegram обновления бота не хранит. Поэтому у
приложения FT-161 своя очередь.

2026-10-29: FT-160 идёт первым, до кода приложения, и заодно проверяет на настоящем iPhone риски FT-161 — диктовку без
сети и данные автоматизации Wallet (решение 2026-10-29, `docs/tasks/decisions.md`).

Definition of Done:
- [ ] `docs/IOS_SHORTCUT_ACTION_BUTTON.md`: пошаговая сборка Shortcut под адрес tailnet и токен владельца; запасной путь через Telegram, когда сервер недоступен
- [ ] Shortcut генерирует `clientId` (UUID) и отправляет его в теле
- [ ] Ответ сервера показан коротко: «Кофе · 25 000 сум» или текст ошибки
- [ ] Проверено на iPhone: при включённом ПК запись появилась; при выключенном фраза ушла в Telegram и записалась после включения
- [ ] Токен не попадает в репозиторий и в общие ссылки на Shortcut
- [ ] Для FT-161 записано: работает ли русская диктовка в «Запросить ввод» в авиарежиме
- [ ] Для FT-179 записано: автоматизация «Транзакция» (Wallet) с действием «Показать уведомление» после оплаты Apple Pay показывает сумму с валютой, магазин и название карты; можно ли включить «Выполнять сразу»; как выглядят сумма и магазин (формат числа, «сырое» имя магазина)

---

### FT-175: Quick capture keeps the time of input

Status: done
Priority: medium
Owner: Claude Code, QA — под-чат проверки
Type: feature
Size: S
Depends on: — (часть FT-161; нужна и FT-152)

Context:
Фраза из очереди iOS-приложения (FT-161) уходит на сервер через часы или дни. Сейчас «сегодня» для разбора — день на
сервере в момент запроса: ИИ получает `new Date().toISOString()` (`openAITranscriptionService.ts:72`), у быстрого пути
своё «сегодня». «Кофе 25к», введённое в понедельник и отправленное в среду, ляжет средой, «вчера такси» — вторником.
Отдельно проверить: `toISOString()` даёт дату по UTC, и `TZ=Asia/Tashkent` её не меняет — похоже, с 00:00 до 05:00 по
Ташкенту ИИ получает вчерашний день.

Офлайн у приложения обязателен (решение 2026-10-29): записи из очереди часто уходят с опозданием, поэтому задача нужна
до того, как приложением пользуются каждый день.

Идея: `POST /api/quick-capture` принимает необязательный `capturedAt` — время ввода на телефоне, ISO 8601 с часовым
поясом. Разбор — ИИ и быстрый путь — считает «сегодня», «вчера» и дни недели от него; запись без даты во фразе
получает день ввода. Без `capturedAt` — как сейчас.

Решить в задаче и записать: пределы (не в будущем больше чем на несколько минут — часы телефона; не старше N дней) и
ответ на нарушение (400 или «сейчас»); день — по поясу из `capturedAt` или по часам пользователя (FT-124).

Definition of Done:
- [x] `capturedAt` принят и проверен; неверный формат или вне пределов — как решено; тест
- [x] Фраза без даты с `capturedAt` позавчера записана позавчерашним днём, «вчера такси» — днём раньше него; и у ИИ, и у быстрого пути; тесты
- [x] Без `capturedAt` поведение не изменилось; тест — кроме трёх намеренных изменений ниже
- [x] Повтор с тем же `clientId` возвращает первые записи при любом `capturedAt`; тест
- [x] UTC-дата «сегодня» проверена: ошибка подтвердилась — исправлена здесь или заведена отдельной задачей — исправлена здесь
- [x] `docs/QUICK_CAPTURE_API.md`: поле и пределы; «No `occurredAt`» убрано из ограничений

Реализовано 2026-10-29…30 (`1f8b7bb`, `27d0585`, `6711c24`, `54c200a`, `33133cd`, `e89acd7`, `4200af1`, `f002a9d`,
PR #130):
- **`capturedAt`** в `POST /api/quick-capture` — время ввода на телефоне: ISO 8601 с секундами и поясом
  (`2026-10-27T09:15:00+05:00`, `…Z`, дробные секунды можно), `null` — как без поля. Неверный формат — `400
  VALIDATION_ERROR` в контроллере (`src/modules/quickCapture/domain/capturedAt.ts`).
- **День ввода** — день этого момента по календарю пользователя (Ташкент, `DEFAULT_TIME_ZONE`, как `toDateOnly` у
  каждой записи), а не пояс из строки: JS `toISOString()` и iOS часто пишут UTC (`Z`), а одна и та же минута через бот,
  Mini App и приложение должна давать один день. `users.timezone` (FT-124) записи пока не читают; когда начнут — день
  ввода и `toDateOnly` сдвинутся вместе.
- **Пределы.** Старше 30 дней — `400 VALIDATION_ERROR`, ничего не записано: это дольше, чем очередь ждёт выключенный
  ПК, старше — запись легла бы в подведённый и проверенный месяц, а «сейчас» положило бы её молча не тем днём;
  приложение держит отказанную запись с текстом. Впереди часов сервера до 24 часов — день из `capturedAt` (дальше
  5 минут — `warn` в логе): часы WSL на ПК отстают после сна на часы. Больше суток вперёд — день по часам сервера и
  `warn`. Пределы проверяются после ответа на повтор `clientId`.
- **ИИ** получает день ввода, его день недели и 7 дней до него («Сегодня 2026-10-27, вторник. Последние 7 дней:
  вторник 2026-10-27, понедельник 2026-10-26, …») и правило «в понедельник — ближайший такой день не позже
  сегодняшнего»; позиция без даты получает день ввода (`AnalysisContext.today`). Список дней добавлен после живого
  прогона: по одной дате `gpt-4.1-mini` поставил «в понедельник», набранное во вторник 27-го, на воскресенье 25-е.
- **Быстрые пути** (`src/modules/voiceProcessing/domain/phraseDay.ts`): «сегодня», «вчера», «позавчера», `bugun`,
  `kecha`, `today`, `yesterday` сдвигают день и уходят из заметки вместе с запятой, тире или скобками. Любой другой
  день уходит ИИ: дни недели по-русски, по-английски и по-узбекски, «в пн»…«в вс», «завтра» / `tomorrow` / `ertaga`,
  «назад», «на прошлой неделе» / `last week` / `o'tgan hafta`, «вчерашний», «на днях», «в выходные». Месяц сам по себе —
  нет: «аренда на ноябрь» — период, а «5 ноября» со вторым числом и так уходит ИИ.
- **UTC «сегодня» — ошибка подтвердилась, исправлена здесь** (тесты сначала были красными): с 00:00 до 05:00 по
  Ташкенту ИИ получал вчерашнюю дату, а быстрые пути, голос, запись без даты (`POST /api/transactions`), долг и его
  погашение писали вчерашний день, `ack` API звал сегодняшнюю запись датой. Теперь везде `todayDateOnly()`. Бот
  подтверждение строит сам (`recordMessageView.ts`) и уже считал по Ташкенту.
- **Три намеренных изменения поведения без `capturedAt`:**
  1. Фраза быстрого пути с «вчера» или «позавчера» ложится вчерашним (позавчерашним) днём, а не сегодняшним, и слово
     уходит из заметки: «вчера обед 45к», которую бот сам подсказывает после позднего итога, раньше писалась
     сегодняшней «вчера обед».
  2. С 00:00 до 05:00 по Ташкенту запись — днём по Ташкенту, а не вчерашним днём по UTC.
  3. Фраза с другим днём («в понедельник такси 18к», «на днях кофе 20к») идёт к ИИ, а не пишется быстрым путём
     сегодняшним днём.
- Тесты: `tests/capturedAt.test.ts` (формат, пределы, день), `tests/phraseDay.test.ts` (слова дня, знаки, месяцы),
  `tests/captureDay.test.ts` (UTC у быстрого пути, ИИ, `ack` и валидатора; `today` у быстрых путей и ИИ; промпт с
  неделей), `tests/captureTimeOfInput.test.ts` (настоящий SQLite: день ввода у быстрого пути и ИИ, пределы, повтор при
  любом `capturedAt`), `tests/quickCaptureRoutes.test.ts`, `tests/shortcutCaptureOwner.test.ts` (по HTTP: повтор со
  старым `capturedAt` — первые записи, новая запись с ним — 400), `tests/debt.test.ts`.
- Документы: `docs/QUICK_CAPTURE_API.md` (раздел «Time of input», ошибки, ограничения, `occurredAt`),
  `docs/pastel/api.md`, `docs/IOS_SHORTCUT_ACTION_BUTTON.md`, `docs/knowledge-base/07-data-flow/voice-to-transaction.md`.

Проверка 2026-10-29…30:
- Под-чат разработки: TDD по срезам; отдельный агент-ревьюер — блокеров нет, мелочи исправлены (месяц сам по себе,
  слова дня, запятая, формулировка дня недели, HTTP-тест повтора). Живой запуск: сервер из ветки на 3100, свежая
  SQLite, бот выключен, настоящий OpenAI, дата сервера 2026-10-29, `X-Dev-User-Id`, «вторник» =
  `2026-10-27T09:15:00+05:00`:

  | Запрос | Ответ |
  |---|---|
  | `кофе 25000`, вторник | 200 · 2026-10-27 · Кафе |
  | `вчера, такси 18000`, вторник | 200 · 2026-10-26 · Транспорт, заметка «такси» |
  | `в понедельник такси 18000`, вторник (ИИ) | 200 · 2026-10-26 (до списка 7 дней — 2026-10-25) |
  | `в субботу ужин 120000`, вторник (ИИ) | 200 · 2026-10-24 |
  | `в пятницу кофе 25000 и такси 18000`, вторник (ИИ) | 200 · 2026-10-23 ×2 |
  | `вчера кофе 25000 и такси 18000`, вторник (ИИ) | 200 · 2026-10-26 ×2 |
  | `обедали с коллегами и такси 30000`, вторник (ИИ) | 200 · 2026-10-27 |
  | повтор `кофе` с `capturedAt` 40 дней назад | 200 · `repeated: true` · 2026-10-27 |
  | новая запись 40 дней назад | 400 `capturedAt is older than 30 days` |
  | на сутки впереди сервера | 200 · 2026-10-29 «Сегодня» (тогда — день сервера; с `e89acd7` до суток — день телефона) |
  | `2026-10-27T09:15:00` без пояса | 400 `capturedAt must be an ISO 8601 time…` |
  | без `capturedAt` | 200 · 2026-10-29 |

- Под-чат проверки: `verify` зелёный, Definition of Done по пунктам и живой сервер; блокеров нет. Серьёзное:
  «впереди больше 5 минут → день сервера» выбирал часы, которые сам называл ошибочными (WSL после сна: ПК проснулся в
  08:00, WSL считает вчерашние 23:xx — набранное в 07:30 легло бы вчера) — исправлено в `e89acd7`: до суток вперёд —
  день телефона. Мелочи исправлены: остаток UTC в `POST /api/transactions` без даты, `createDebt`, `payDebt`
  (`4200af1`); другие дни по-английски и по-узбекски, «в пн»…«в вс», скобки и тире вокруг слова дня (`f002a9d`).
- `npm run verify` зелёный на коде `f002a9d`: Jest 1738 прошли, 1 пропущен; Vitest webapp 127 файлов; сборки; шрифты и
  токены; зависимостей и циклов нет.

Известно:
- Фраза с днём недели или другим днём без ИИ (OpenAI лежит, исчерпан лимит) теперь даёт ошибку, а не запись: быстрый
  путь её больше не пишет сегодняшним днём.
- `ack.details` показывает сырую дату «2026-10-28», а не «Вчера» или «28 октября».
- Позиции `withoutAmount` (FT-123) теряют день ввода, если дату им не дал ИИ: бот потом пишет их днём ответа.
- Повтор с испорченным `capturedAt` получает 400 — формат проверяется до повтора; клиент шлёт тот же `capturedAt`.
- `gpt-4.1-mini` на «кофе 25000 и вчера такси 18000» ставит вчера обе записи.
- Границы периодов бюджетов и расхода OpenAI (`createBudget.ts`, `budgetPeriodCalculator.ts`,
  `openAIUsageRepository.ts`) по-прежнему через `toISOString()`: это не «сегодня» записи, бюджеты ушли из интерфейса (Д2).
- Бот датирует фразу днём обработки, а не временем сообщения: FT-182.

---

### FT-177: iOS app skeleton: settings, the token in Keychain and the queue

Status: done
Priority: medium
Owner: Claude Code, Shukur (Xcode, iPhone), QA — под-чат проверки
Type: feature
Size: M
Depends on: Xcode 27.1 и симулятор iOS 27.1 на маке (Шукур, 2026-10-29). `capturedAt` клиент шлёт сразу: до FT-175
сервер лишние поля пропускает

Context:
Первый срез FT-161: приложение Kapelka в папке `ios/` ставится на iPhone Шукура с бесплатным Apple ID, хранит записи и
отправляет их, когда сервер отвечает. SwiftUI, iOS 17+ (Action Button), без сторонних библиотек; интерфейс — системные
элементы, чёрно-белый (решение 2026-10-29). Ввод в этом срезе — простое поле текста на главном экране; голос, команды и
список — FT-178.

- **Настройки** (шторка): адрес (`https://<пк>.<tailnet>.ts.net`) и токен (`SHORTCUT_CAPTURE_TOKEN`) — токен только в
  Keychain, не в `UserDefaults`, коде или логах; «Проверить связь» — `GET /api/health` → «Сервер доступен» или
  «Не отвечает».
- **Очередь**: запись пишется на диск — с `clientId` (UUID) и `capturedAt` — до попытки отправки и уходит в
  `POST /api/quick-capture` с `X-Shortcut-Capture-Token` по правилам FT-161, «Как устроено». Ждущая не теряется при
  закрытии приложения, перезагрузке телефона и переустановке сборки. Сама уходит, когда появилась сеть
  (`NWPathMonitor`) при открытом приложении, и в фоне через `BGAppRefreshTask`, когда даст iOS. Отправленные хранятся
  для списка — сколько, решить (например, 50 последних).

Definition of Done:
- [x] `ios/` — Xcode-проект без сторонних пакетов; собирается и тестируется из командной строки (`xcodebuild test`)
- [x] Команда подписи — в локальном `.xcconfig` вне git; `.gitignore` для `DerivedData` и `xcuserdata`
- [x] `ios/README.md`: установка на iPhone с бесплатным Apple ID (Developer Mode, подпись, переустановка раз в 7 дней — данные остаются), запуск тестов
- [x] Токен в Keychain; в репозитории и логах его нет; тест
- [x] Запись на диске до попытки отправки: приложение, убитое сразу после ввода, и перезагрузка её не теряют; каждое правило ответа — тест с подменой сети
- [x] Появилась сеть при открытом приложении — очередь уходит сама; фоновая отправка зарегистрирована; тест
- [x] Повтор после потерянного ответа — с тем же `clientId`, дубля нет; две отправки одновременно не шлют одну запись дважды; `capturedAt` — время ввода; тесты
- [x] Против настоящего сервера на маке (тестовый порт): сервер выключен → 3 записи → включён → каждая по одному разу
- [x] Поставлено на iPhone Шукура; настройки и токен пережили переустановку; в авиарежиме 3 записи текстом → связь → каждая по одному разу, с временем ввода — время ввода сервер учитывает с FT-175
- [x] `verify.yml` не менялся; `npm run verify` зелёный

Реализовано 2026-10-29…30 (`bcbc71c`, `db746da`, `9dea2f4`, `77dfe83`, `c256256`, `6e10a1a`, `89565f3`, `8820d3c`,
PR #131):
- **Проект `ios/`**: `Kapelka.xcodeproj` написан руками (синхронизированные папки, общая схема), SwiftUI, iOS 17+,
  Swift 6, без сторонних пакетов. Подпись — `DEVELOPMENT_TEAM` только в `ios/Config/Signing.local.xcconfig` вне git
  (`#include?` из `Base.xcconfig`); `ios/.gitignore` — `DerivedData/`, `xcuserdata/`, локальный xcconfig.
  `ios/scripts/test.sh` — `xcodebuild test` на первом iPhone-симуляторе; отказывает, если Team ID остался в
  `project.pbxproj`.
- **Очередь** (`Kapelka/Queue/`): actor `CaptureQueue`, файл `Application Support/Kapelka/captures.json` — атомарная
  запись, читается после первой разблокировки. Фраза с `clientId` (UUID) и `capturedAt` (время ввода с поясом
  телефона, `2026-10-29T14:32:05+05:00`) ложится на диск до первой попытки. Уходит по одной, старые первыми, с
  `X-Shortcut-Capture-Token`. 2xx — «записано» с `ack`; 400 — «отклонено», больше не уходит, очередь идёт дальше;
  401/403 — стоп до «Сохранить» в настройках; 429 — пауза по `Retry-After` (без него минута, не больше часа); нет сети,
  таймаут, 5xx, 2xx не от Kapelka и всё прочее — ждёт. Один проход за раз, повод посреди прохода даёт ещё один; повтор —
  тот же `clientId`. Хранятся все ждущие и 50 последних завершённых. Файл, который ещё не открыть (до первой
  разблокировки), очередь не затирает — ждёт; файл старой сборки читается со значениями по умолчанию.
- **Настройки** (шторка): адрес — в `UserDefaults`, сводится к схеме, хосту и порту, `http` только для `localhost` и
  `127.0.0.1`; токен — только в Keychain (`AfterFirstUnlockThisDeviceOnly`); «Проверить связь» — `GET /api/health`:
  «Сервер доступен», «Сервер ответил с ошибкой N», «Не отвечает».
- **Отправка сама**: после ввода, при открытии, на каждый новый путь `NWPathMonitor` (Wi-Fi, мобильная сеть, включённый
  Tailscale), по «Отправить сейчас», в фоне — `BGAppRefreshTask` `kapelka.send-queue` (режим `fetch`), запрос не раньше
  чем через 15 минут, проход в фоне сам обрывается через 25 с. Закрытое сразу после ввода приложение досылает запрос
  через `beginBackgroundTask`. Редиректы запрещены — токен не уйдёт на другой хост.
- **Экран**: поле и «Записать», строка состояния («В очереди: N», итог сервера, «проверь токен»), шестерёнка —
  настройки; чёрно-белый, системные элементы. Голос, список и команды — FT-178.
- Документы: `ios/README.md` (как устроено, тесты, установка с бесплатным Apple ID, переустановка раз в 7 дней,
  проверка в авиарежиме), `CLAUDE.md` (команда тестов, `ios/`).

Проверка 2026-10-29…30:
- Под-чат разработки: TDD по срезам; тесты Swift Testing — 53, на симуляторе iOS 27.1 три прогона подряд без падений и
  предупреждений. Намеренные поломки на копии кода ловятся: без одного прохода за раз — 2 теста, новый `clientId` на
  повтор — 3, «нечитаемый файл = пустой» — тест с закрытым файлом (воспроизводит затирание), без поколения настроек —
  тест позднего 401. `npm run verify` зелёный на дереве, слитом с `main` (FT-175): Jest 107 наборов — 1738 прошли, 1
  пропущен; Vitest 127 файлов, 1277; зависимостей и циклов нет.
  Против настоящего сервера из ветки на 3177 (временная SQLite, бот выключен, свой тестовый токен), симулятор:

  | Шаг | Результат |
  |---|---|
  | сервер выключен, «Проверить связь» | «Не отвечает» |
  | 3 фразы | «В очереди: 3» |
  | приложение убито, сборка переустановлена поверх | в `captures.json` 3 ждущие; в настройках только `serverAddress`; токена нет ни в одном файле приложения |
  | неверный токен | один запрос, 401, «Сервер не принял токен — проверь токен в настройках»; «Отправить сейчас» ничего не шлёт |
  | верный токен, сервер включён, «Отправить сейчас» ×3 | 3 запроса, 3 записи, повторов `client_id` 0; `clientId` с телефона, `source = ios_shortcut`; первая ушла 6 раз с одним `clientId` — запись одна |
  | «Проверить связь», светлая и тёмная тема | «Сервер доступен» |

- Отдельный агент-ревьюер: 1 критичная, 3 важных, 5 мелких — исправлены в `89565f3`, к каждой — красный тест сначала.
  Критичная: файл очереди, который не открыть до первой разблокировки, читался как пустой — следующая фраза затёрла бы
  ждущие. Важные: фоновое обновление запрашивалось только после отправки (спящий ПК держит запрос дольше времени фона),
  файл старой сборки откладывался бы в сторону, тесты, проходившие со сломанной реализацией. Повторный прогон нашёл ещё
  одну: повод отправить посреди неудачной попытки (включился Tailscale) терялся.
- Под-чат проверки: тесты, `verify`, свой сценарий против сервера — 3 из 3 по одному разу; блокеров нет. Исправлено в
  `8820d3c`: нестабильный тест «появилась сеть» (ждал начала третьего запроса, а не записи в файл; 1 из 6, с задержкой
  20 мс — всегда), запасной файл `Documents/captures.json` убран, `http` — только для `localhost`/`127.0.0.1`, строка в
  README про 401/403. Шесть мелочей перенесены в FT-178.
- iPhone Шукура (iPhone 16 Pro Max, iOS 18.7.8, 2026-10-30): Режим разработчика, подпись Personal Team, сборка
  поставлена с мака; адрес и токен пережили переустановку поверх — сборка `8820d3c` встала поверх первой, вводить заново не пришлось; в авиарежиме 3 записи текстом → связь → в Mini App каждая по одному разу.

Известно:
- Из проверки — в FT-178: после 429 нет таймера до `Retry-After`; второй вызов `flush()` возвращается раньше
  дополнительного прохода; `cancelSending()` сбрасывает `passRequested`; ошибки 400 — текстом сервера по-английски;
  тесты копят `ft177-queue-*` и наборы `kapelka.tests.*`; хост тестов — само приложение, его живые сервисы стартуют.
- День ввода на живом экземпляре — после `scripts/live-update.sh` с FT-175 (слита 2026-10-30); до него запись ложится
  днём отправки.
- Подпись бесплатного Apple ID живёт 7 дней: текущая сборка — до 2026-11-06 10:05 по Ташкенту; переустановка с мака
  поверх, данные остаются. Удаление приложения стирает неотправленные записи.
- `npm run verify` не видит `ios/`: iOS проверяется `ios/scripts/test.sh` на маке.
- `appMovedToBackground` без юнит-теста — нужен `UIApplication`; покрыт тестами `BackgroundSend`.
- Симулятор «iPhone Duo»: ввод через HID идёт по русской раскладке, кириллица и вставка — через буфер, который молча не
  срабатывает; проверка с сервером — латиницей и токеном из цифр.
- Своей иконки нет — FT-169.

---

### FT-176: Quick capture takes a ready amount from Apple Pay

Status: done
Priority: medium
Owner: Claude Code, QA — под-чат проверки
Type: feature
Size: M
Depends on: FT-175 (те же файлы quick-capture)

Context:
Оплата Apple Pay (FT-179) приходит в iOS-приложение уже разобранной: сумма, валюта, магазин, карта. Слать её фразой
нельзя (решение 2026-10-29): разбор читает голое число меньше 1000 в сумах как тысячи (`amountReply.ts:8`, «500» →
500 000 сум), а цифры в названии магазина («KORZINKA 24») путают сумму.

Идея: quick-capture по токену принимает оплату полями — сумма, валюта `UZS` | `USD`, магазин, название счёта (из
сопоставления карт в приложении), `clientId`, `capturedAt`. Сумма, валюта и дата пишутся как есть. Категорию даёт
магазин: своё имя категории, словарь и выученные слова (FT-138, FT-143), иначе ИИ выбирает только категорию, иначе
«Другое» с предположением `category`. Счёт ищется по названию, как подсказка счёта во фразе (FT-103); не нашёлся или не
пришёл — счёт по умолчанию с предположением `account` и `needsReview`. Ответ — тот же `QuickCaptureResult` с `ack`.

Решить в задаче: та же точка `POST /api/quick-capture` с объектом оплаты вместо `text` или отдельная
`POST /api/quick-capture/payment` (тот же токен и лимит); сумма числом в минимальных единицах или строкой; где хранить
магазин (`merchant`, описание); `source` у таких записей.

Definition of Done:
- [x] Контракт оплаты описан в `docs/QUICK_CAPTURE_API.md` — FT-179 строится на нём
- [x] Сумма записана ровно как пришла: 500 сум — 500, 4.50 USD — 4.50; тест
- [x] Категория по магазину: выученный магазин — без ИИ; незнакомый — ИИ выбирает только категорию; ИИ недоступен — «Другое» с пометкой; тесты
- [x] Счёт по названию; неизвестное название или без него — счёт по умолчанию и `needsReview`; тест
- [x] Валюта не `UZS` и не `USD` — 400; тест
- [x] Повтор с тем же `clientId` не создаёт дубля; токен и владелец — как у фразы (FT-155); тесты

Реализовано 2026-10-30 (`25c556c`, `39d6a1c`, `ea0b0b1`, `a97b6fc`, `5f937f7`, PR #133):
- **Точка `POST /api/quick-capture/payment`** на роутере quick capture: тот же `allowShortcutCapture` с токеном
  владельца (FT-155), лимит ИИ и `QuickCaptureResult`. Отдельная, а не объект оплаты в `/api/quick-capture`: у оплаты
  нет `text` и свои правила полей, а ошибки фразового маршрута, на которые опираются Mini App и бот, не меняются.
- **Тело** (`paymentRequest.ts`, `paymentCapture.ts`): `amount` — десятичная строка в основных единицах через точку
  (`"25000"`, `"4.50"`), без знака, пробелов, запятой, экспоненты и третьего знака; JSON-число — 400. Почему строка:
  клиент не умножает на 100 (а минимальные единицы UZS библиотеки считают по-разному), строка точная, а `JSONEncoder`
  пишет `Decimal` через `Double`; формат Wallet узнаем в FT-179 и приведём к этой строке. `currency` — ровно `UZS` или
  `USD`; `merchant` до 200 знаков, `accountName` до 100; `clientId` обязателен — оплата всегда идёт из очереди с
  повторами; `capturedAt` — как у фразы (FT-175). `userId`, `source` и `text` из тела не читаются.
- **Запись** (`RecordPaymentUseCase`): сумма, валюта и день — как пришли, без «тысяч». Категория — по магазину, правилом
  простой фразы (общая `categoryNamedBy`, FT-143): своё имя категории, словарь, выученные слова — без ИИ; иначе ИИ
  выбирает только категорию (`categoryOfMerchant`, свой промпт с расходными категориями пользователя и выученными
  паттернами); иначе — нет магазина, ИИ упал или ответил не JSON — «Другое». В двух последних случаях — предположение
  `category` и «?». Заметка и `merchant` — магазин (без него — «Оплата Apple Pay»); `originalText` — магазин;
  `originalParsing.category` — категория, куда легла запись, а не сырое имя от ИИ.
- **Счёт** — видимый счёт в валюте оплаты, чьё имя целиком равно `accountName` (`accountNameKey`: без регистра, «ё» и
  пробелов по краям; `AccountResolutionInput.name`). Вхождение, как во фразе (FT-103), не считается: имена в
  приложении вводятся руками и могут устареть. Иначе — счёт по умолчанию, `reason: default` и `needsReview`
  (`accountHint.reviewUnlessNamed` в `CreateTransactionUseCase`); доллары без долларового счёта — ещё и
  `no_usd_account`. Поиск счёта во фразах не менялся.
- **`source: apple_pay`** — новое значение `RECORD_SOURCES` (`APPLE_PAY_SOURCE`), его ставит сервер; фраза заявить его
  не может — это не `CaptureSource`. Миграции нет: колонка `varchar`.
- **Повторы** — общий для фразы и оплаты `once()` в `QuickCaptureService` (одновременные запросы) и ответ первыми
  записями по `clientId`: ничего не пишет, ИИ не зовёт. `source` ответа на повтор — источник найденной записи.
- Тесты: `tests/paymentAmount.test.ts` (формат суммы), `tests/recordPayment.test.ts` (настоящий SQLite: сумма,
  категория, счёт, повторы, промпт ИИ), `tests/paymentCaptureRoutes.test.ts` (HTTP в production с токеном владельца:
  ошибки по полям, токен и владелец, повтор, фраза как раньше), `tests/categoryGuess.test.ts` (`categoryNamedBy`).
- Документы: `docs/QUICK_CAPTURE_API.md` — раздел «Payments» (решения и почему, поля, что пишется, ответ, ошибки,
  живой ответ, памятка для FT-179); `docs/pastel/api.md`, `docs/pastel/money-model.md` (`apple_pay`), `modules.md`,
  `voice-to-transaction.md`, `CLAUDE.md`.

Проверка 2026-10-30:
- Под-чат разработки: TDD по срезам; намеренные поломки ловятся (без `reviewUnlessNamed` — 2 теста, счёт по вхождению —
  3). Живой запуск: сервер из ветки на 3176, `NODE_ENV=production`, временная SQLite, свой тестовый токен, бот
  выключен, настоящий ИИ (`gpt-4.1-mini`):

  | Запрос | Ответ |
  |---|---|
  | `KORZINKA 24`, "25000" UZS, счёт «Карта», `capturedAt` 29-го | 200 · «Продукты?» (ИИ) · «Карта» · `saved` · 2026-10-29 |
  | тот же `clientId` | 200 · `repeated: true` · тот же id |
  | `EVOS`, "500" UZS, без счёта | 200 · 500 сум · «Кафе» без ИИ · `needs_review` |
  | `APPLE.COM/BILL`, "4.50" USD | 200 · 4,50 USD · «Другое?» · `no_usd_account` · `needs_review` |
  | `OXYMED APTEKA`, "86400" UZS | 200 · «Здоровье?» (ИИ) |
  | `EUR` / сумма числом / без `clientId` | 400 · поле в `error.context.field` |
  | неверный токен | 401 `INVALID_SHORTCUT_TOKEN` |
  | фраза на `/api/quick-capture` | 200 · `ios_shortcut`, как раньше |

  В базе у оплат `source = apple_pay`, `amount_minor` — ровно как отправлено.
- Под-чат проверки: `verify` зелёный, свой сервер с настоящим ИИ; схема, сумма, повторы, безопасность и регрессии фраз —
  в порядке, блокеров нет. Серьёзное, исправлено в `5f937f7`: счёт искался вхождением (`"Humo Black"` → «Humo» без
  пометки, «Visa карта» → «Карта») — теперь только целое имя, а предпочтение самого длинного имени во фразах убрано;
  дока обещала, что правка категории в Mini App учит магазин, — не учит ни оплату, ни фразу (проверено: две оплаты
  «ZZQX 77/78» исправлены в «Продукты», третья ушла к ИИ) — дока исправлена, тест переименован, причина — в FT-184.
  Мелочи исправлены там же: константа `APPLE_PAY_SOURCE`, `source` ответа на повтор, `originalParsing.category` —
  итоговая категория; в памятку FT-179 — общий `clientId` всех записей, лимит ИИ считает и ответы 400, худший ответ
  около 40 с (таймаут клиента — 60 с), имена счетов сравниваются точно.
- `npm run verify` зелёный на коде `302a20f` (слит `main` с FT-177 и FT-183 на доске): Jest 110 наборов — 1817
  прошли, 1 пропущен; Vitest webapp 127 файлов, 1277; сборки; шрифты и токены; зависимостей и циклов нет.

Известно:
- Правка категории в Mini App ничему не учит — ни оплату, ни фразу: FT-184. Шаг «выученные слова» находит пока то, что
  в сиде и в старых уроках.
- Ответ на повтор — без «?» и `accountName`: предположения не хранятся (FT-106, как у фраз).
- Оплата расходует общий лимит ИИ (20 запросов за 15 минут), даже если ИИ не звали и даже ответом 400.
- Оплата — всегда расход: возврат из Wallet, если придёт, не отличается (что шлёт Wallet, узнает FT-179).
- Одна покупка, оплаченная Apple Pay и сказанная голосом, — две записи; `source: apple_pay` помечает оплату.
- Все счета скрыты — 400 `No visible account to record into`, очередь сочтёт оплату ошибкой.
- Живой экземпляр получит маршрут после `scripts/live-update.sh`.

---

### FT-178: Voice from the Action Button and the main screen

Status: done
Priority: medium
Owner: Claude Code, Shukur (iPhone), QA — под-чат проверки
Type: feature
Size: M
Depends on: FT-177

Context:
Главное в FT-161 (решение 2026-10-29): нажал Action Button, сказал — записалось. «Записать трату» — App Shortcut
приложения: есть в «Быстрых командах» и в выборе для Action Button сразу после установки. Запуск открывает приложение
сразу в режиме «слушаю»: распознаёт Apple на телефоне (`ru-RU`, `requiresOnDeviceRecognition`) — одинаково с сетью и
без, звук никуда не уходит; пауза около 1,5 с или нажатие — запись уходит в очередь (FT-177) и отправляется; ответ —
итог сервера или «в очереди N». Запасной путь — клавиатура на том же экране. Для голоса без сети нужна скачанная
русская диктовка — шаг инструкции; телефон отвечает «недоступно» — сообщение «скачай русскую диктовку» и клавиатура.
«Отправить очередь» — команда без ввода для автоматизаций (например, «подключился к домашнему Wi-Fi»).

Главный экран — один, системные элементы, чёрно-белый: кнопка микрофона, распознанный текст, поле для текста, список
последних записей со статусом (ждёт — время и фраза, записано — `ack.summary`, нужно проверить, не нашёл операцию,
ошибка), «Отправить сейчас», удалить ждущую. В настройках — как назначить команду на Action Button (Настройки → Кнопка
действия). Правка записей — в Mini App.

Из проверки FT-177 (PR #131) — доделать здесь:
- после 429 нет таймера до `Retry-After`: при открытом приложении очередь ждёт следующего повода, а не сама уходит в срок;
- гонка в `CaptureQueue.flush()`: второй вызов, присоединившийся к идущему проходу, возвращается раньше, чем закончится
  дополнительный проход после него;
- `cancelSending()` сбрасывает `passRequested`: повод, пришедший до отмены, теряется до следующего;
- ошибки 400 показываются текстом сервера по-английски (`rejection`) — в списке нужен русский текст;
- тесты копят папки `ft177-queue-*` во временной папке и наборы `kapelka.tests.*` (UserDefaults, Keychain) в симуляторе —
  убирать за собой;
- тесты поднимают живые сервисы приложения (`AppServices.live()`, сеть, `NWPathMonitor`): хост тестов — само приложение;
  при запуске под тестами их не стартовать.

Definition of Done:
- [x] Сразу после установки «Записать трату» и «Отправить очередь» есть в «Быстрых командах» и в выборе для Action Button — без настройки
- [x] Нажал Action Button → приложение слушает без лишних нажатий → после паузы запись ушла
- [x] Микрофон и распознавание спрашиваются один раз; отказ или нет распознавания — клавиатура
- [x] Список со статусами; удалённая ждущая запись не уходит; тест
- [x] Скриншоты светлой и тёмной темы (симулятор) — `docs/tasks/screens/ft-178/`, iPhone 16 Pro Max
- [x] Голос без сети: в авиарежиме русская фраза распознана на телефоне и легла в очередь; без скачанной диктовки — сообщение и клавиатура
- [x] Проверено на iPhone: ПК выключен → 3 записи голосом → ПК включён → каждая по одному разу, с днём ввода

Реализовано 2026-10-30 (`58e14fb`, `169ed24`, `fdf159d`, `75754bc`, `60341ec`, `f6958b2`, `9f82e6a`, `d5f3ca0`,
`8be3225`, `395267c`, PR #134):
- **Команды** (`Kapelka/Intents/CaptureShortcuts.swift`), обе в `Metadata.appintents` сборки (тест):
  - «Записать трату» — `openAppWhenRun` → `ListenRequest`; экран начинает слушать, когда он активен и настройки
    закрыты;
  - «Отправить очередь» — без открытия приложения, через `BackgroundSend.run()` с лимитом 25 с; ответ «Всё отправлено»
    или «В очереди: N — сервер пока недоступен».
- **Голос** (`Kapelka/Voice/`):
  - `VoiceCapture` — фазы idle → starting → listening → finishing → saving. Фраза уходит в очередь FT-177 после паузы
    1,5 с от последнего изменения или по нажатию. «Отмена» ничего не пишет; 6 с тишины — «Не расслышал».
  - `AppleSpeech` — `ru-RU` с `requiresOnDeviceRecognition`, звук не уходит с телефона. Вход проверяется до
    `inputNode`: без микрофона — «Микрофон недоступен». В симуляторе голос выключен: там CoreAudio ронял приложение.
  - `VoiceAccess` — спрашивает только то, о чём iOS ещё не спрашивал.
  - `HeardPhrase` — найдено Шукуром на iPhone: после паузы распознавание присылает пустой отрезок. Он больше не стирает
    фразу, слова после паузы дописываются, повтор закрытого отрезка не дублируется.
- **Решения Шукура 2026-10-30**:
  - уход с экрана (блокировка, «Домой») и прерывание звука записывают услышанное; если ничего не сказано — ничего;
  - прерывание — это звонок, Siri, пропавшие наушники (`interruptionNotification`, `routeChangeNotification`);
  - второе нажатие «Записать трату» во время записи заканчивает фразу, как кнопка.
- **Главный экран**:
  - микрофон: чёрный круг в светлой теме, белый в тёмной;
  - распознанный текст, поле, итог последней фразы или «В очереди: N», «Отправить сейчас»;
  - список, новые сверху: «Ждёт · время», «Отправляю», `ack.title` с `ack.summary`, «Не нашёл операцию», «Ошибка» с
    причиной по-русски (`RejectionText`);
  - ждущая запись удаляется свайпом и не уходит;
  - запись в пути не удаляется: сервер мог её записать;
  - при удалении записи, которая уже уходила, — «проверь Mini App»;
  - проблема с голосом — сообщение и клавиатура, в поле услышанное.
- **Настройки**: как назначить команду на Action Button, как скачать русскую диктовку, автоматизация «Wi-Fi дома».
- **Из проверки FT-177**:
  - таймер до `Retry-After`;
  - `flush()`: отправка сообщает, что её остановили, и каждый неотменённый ждущий вызов начинает её снова.
    Присоединившийся вызов возвращается после своего прохода; отправка, остановленная для фона, не теряется для
    открытого приложения;
  - тексты 400 — по-русски;
  - тесты убирают за собой папки, Keychain и `kapelka.tests.settings`;
  - под тестами приложение — пустой хозяин (`KapelkaMain`).
- **Документы**: `ios/README.md`; скриншоты — `docs/tasks/screens/ft-178/`.

Проверка 2026-10-30:
- **Под-чат разработки.**
  - TDD: к каждой правке сначала красный тест.
  - Swift Testing: 110 тестов в 16 наборах, на симуляторе три прогона подряд без падений; сборка без предупреждений.
  - `npm run verify` зелёный на дереве, слитом с `main` (FT-176): Jest 110 наборов — 1817 прошли, 1 пропущен; Vitest 127 файлов, 1277; зависимостей и циклов нет.
  - Симулятор:

  | Шаг | Результат |
  |---|---|
  | главный экран и список, светлая и тёмная тема | все статусы; iPhone 16 Pro Max (iOS 26.4) и «iPhone Duo» (iOS 27.1) |
  | свайп по ждущей записи | серая «Удалить»; запись ушла из файла и на сервер не пришла. В тёмной теме кнопка была белой на белом — исправлено |
  | вопросы о микрофоне и распознавании | по одному разу, с текстами приложения |
  | тестовый сервер на 3177: 429 с `Retry-After: 5` | через 5 с запись ушла сама, тот же `clientId` и `capturedAt` |
  | 401 | «Сервер не принял токен», «Отправить сейчас» скрыта |
  | микрофон | до правки — падение в CoreAudio («RPC timeout… Apparently deadlocked»); после — «Микрофон недоступен» и клавиатура |
  | команды | журнал: `linkd` собрал App Shortcuts для `uz.kapelka.app`, `siriactionsd` записал 2 действия в индекс Spotlight; приложения «Быстрые команды» в рантайме нет |

- **Отдельный агент-ревьюер**: блокеров нет, 2 важных и 9 мелких замечаний, исправлено в `f6958b2`. Важные:
  - остановленная отправка терялась для вызова, который её начал, и для оборванного доп. прохода;
  - запись, удалённая в пути, могла пропасть с телефона, хотя сервер её записал.
- **iPhone Шукура, до проверки**: после паузы — «Не расслышал», а по «стоп» фраза записывалась. Пустой отрезок
  распознавания стирал фразу; исправлено в `9f82e6a`.
- **Под-чат проверки**: тесты трижды и `verify` — зелёные, блокеров нет. Серьёзная находка: фраза молча пропадала при
  уходе в фон. Решения Шукура и мелочи — `d5f3ca0`.
- **iPhone Шукура** (iPhone 16 Pro Max, iOS 18.7.8): Шукур, 2026-10-30: проверка по шагам прошла, всё работает.

Известно:
- `appMovedToBackground` и звук `AppleSpeech` (микрофон, прерывания) — без юнит-тестов: нужны `UIApplication` и
  настоящий звук.
  - Их логика в тестах: `VoiceCapture.wrapUp()`, `HeardPhrase`, `BackgroundSend`.
  - Звук проверен на iPhone.
- **Фоновое время.** После него другой ждущий вызов (новая сеть, отправка фразы) может снова начать отправку. iOS
  усыпит приложение посреди запроса, запись уйдёт позже с тем же `clientId`. У отправок нет номера, поэтому поздний
  `cancelSending()` может остановить и новую — она начнётся снова.
- **«Сохранить пароль?»** iOS спрашивает это после «Сохранить» в настройках: так она реагирует на поле токена
  (`SecureField`, FT-177).
- **Симуляторы.**
  - «iPhone Duo» — единственная модель iPhone в рантайме iOS 27.1; голос в симуляторе выключен.
  - Для скриншотов скачан рантайм iOS 26.4 (8,5 ГБ) и создан симулятор «iPhone 16 Pro Max».
  - iOS 18 Xcode 27.1 не отдаёт.
- **Подпись** бесплатного Apple ID живёт 7 дней: переустановка с мака поверх, данные остаются.
- **Иконка**: своей нет — FT-169.

---

### FT-184: A category correction in the Mini App teaches

Status: done
Priority: medium
Owner: Claude Code, QA — под-чат проверки
Type: bug
Size: S (вышло M: два круга проверки)

Context:
Найдено под-чатом проверки FT-176 (2026-10-30). Правка категории в Mini App ничему не учит — ни у фразы, ни у оплаты
Apple Pay. Mini App шлёт только `PUT /api/transactions/:id` с `{ categoryId }` (`patchTransaction`,
`webapp/src/entities/transaction/api/mutations.ts:233`; вызовы — `useRecordEdits.ts`, `useCaptureReview.ts`), а
сервер учится, только если в теле запроса есть `originalText` и `originalParsing`
(`transactionController.ts:424` → `UpdateTransactionWithLearningUseCase`, `recordLearningData`); их никто не шлёт.
Проверено на живом сервере: две оплаты «ZZQX 77» и «ZZQX 78» исправлены в «Продукты», третья всё равно ушла к ИИ.
Выученные паттерны (FT-138) пополняются только сидом.

Идея: сервер берёт `originalText` и `originalParsing` из сохранённой записи (они пишутся при создании: текст фразы,
магазин оплаты), а не из тела запроса; тело с ними — как раньше, но не обязательно. Учит только смена категории, как
сейчас (`userCorrection.category` — `presetKey` стартовой категории; своя категория пользователя ничему не учит).

Definition of Done:
- [x] Правка категории записи из фразы через `PUT /api/transactions/:id { categoryId }` записывает урок; тест
- [x] То же для оплаты Apple Pay: две правки «ZZQX 77/78» в «Продукты» → третья оплата «ZZQX» — «Продукты» без ИИ; тест
- [x] Запись без `originalText` (ручная форма, `POST /api/transactions`) ничему не учит и не падает; тест
- [x] Проверено, учит ли правка категории в боте; если нет — здесь же или отдельной задачей
- [x] `docs/QUICK_CAPTURE_API.md` («Payments», шаг 3) и `voice-to-transaction.md` («Learning System Integration»)
      говорят, что правка учит

Реализовано 2026-10-30 (`5488bdd`, `ccfaaae`, `552d8de`, `49cde9c`, `19a4316`, `2bd40ea`, `02bcc5e`, `7e3d6af`,
PR #137):
- **Где учится.** `UpdateTransactionUseCase` учится сам, через `teachCategoryCorrection` и порт `CategoryLessons`
  (`transaction/domain/categoryLessons.ts`, реализует `TransactionLearningService`).
  - Что учить и категорию разбора он берёт из сохранённой записи; webapp не менялся.
  - Бот («Изменить» → «Категорию») идёт в тот же use case. Раньше он не учился: `getUpdateTransactionUseCase()` был
    без обучения. Теперь его подключает `TransactionModule.setCategoryLessons()`.
  - `PUT` с `originalText` и `originalParsing` в теле — как раньше, через `UpdateTransactionWithLearningUseCase`.
- **Один урок на запись.** Любая смена категории сначала снимает всё, чему запись учила (`unlearnRecord`, по id
  записи, до любых ранних выходов). Потом она учит новую категорию, если та стартовая и не совпадает с категорией
  разбора.
  - Категорию разбора `CreateTransactionUseCase` запоминает в `originalParsing.categoryId` (JSON-колонка, без
    миграции): переименование и скрытие стартовой категории её не сдвигают.
  - «Отменить» в Mini App только снимает урок; уход в свою категорию — тоже.
- **Оплата учит свой магазин целиком** (решение штаба, круг 1).
  - `merchantKey` — слова в нижнем регистре без слов с цифрами: «ZZQX 77» = «ZZQX 78».
  - Магазин хранится merchant-паттерном с меткой `fromPayments`. Его находит только точный поиск
    (`learnedMerchants`, шаг 0 в `RecordPaymentUseCase.correctedCategoryOf`, до словаря): с первой правки, без ИИ и
    без «?».
  - Словом в названии и строкой подсказки ИИ он не служит (круг 2). Счёт уроков ведётся на категорию: правка в другую
    категорию начинает его заново.
- **Фраза учит слова** (`lessonWordsOf`, `voiceProcessing/domain/lessonWords.ts`).
  - Не учатся: слова оплаты (как у `stripPaymentWords`), общие слова, числа и числительные, дни, месяцы и числа
    месяца, юрлица, торговые слова, платёжные сервисы, города, слова из названий счетов (`AccountResolver.accountNames`).
  - Во фразе из нескольких записей учат только слова исправленной записи (`recordWordsOf`).
  - Уроки считаются на каждое слово (решение штаба, круг 1). Один урок — категория на быстром пути как догадка:
    «Продукты?», предположение `category`, новый ярус `categoryNamedBy`, без ИИ. Без `needsReview`: запись остаётся в
    итогах, как у догадки ИИ (согласовано со штабом). С двух уроков (`MIN_WORD_LESSONS`) — уверенно и в подсказке ИИ.
  - Слово, которому учили две категории, не даёт ни одну. Сид не тронут.
- **Без урока.** Своя категория без `presetKey` (решение под-чата, Шукур знает), запись, сделанная руками, оплата без
  магазина — и старые оплаты с текстом «Оплата Apple Pay» (урок оплаты берётся из `merchant`). Новые оплаты без
  магазина этот текст в `originalText` не пишут. Урок без слов ничего не считает.
- **Файлы обучения.**
  - Логика уроков — чистые функции `categoryLessonStore.ts`, файлы — `learningFiles.ts`, типы — `learningTypes.ts`.
  - В `patterns.json` новая секция `words` (`{ word, category, uses }`). В истории `learning-data.json` — `recordId`,
    `lessonWords`, `merchant`.
  - Изменения идут по одному за раз, файл пишется целиком (`*.tmp`, затем `rename`). Битый файл перед перезаписью
    копируется в `*.corrupt-<время>`, в лог пишется `error`. `data/*.tmp` и `data/*.corrupt-*` — в `.gitignore`.
- **Документы:**
  - `voice-to-transaction.md` («Learning System Integration»): когда слово и магазин начинают работать; что выученное
    общее для всех пользователей;
  - `QUICK_CAPTURE_API.md` («Payments»: шаг 0 и 3, строка Merchant);
  - `CLAUDE.md`, `modules.md`;
  - FT-200 — в backlog.

Проверка 2026-10-30:
- **Под-чат разработки.**
  - TDD: к каждой правке сначала красный тест. Мутации проверены: без снятия урока, без отбора слов записи, без яруса
    догадки, без поиска магазина, со снятием после ранних выходов и без очереди записей тесты падают.
  - Тесты: `tests/categoryCorrectionLearning.test.ts` (18, HTTP `PUT` как в Mini App), `tests/transactionLearning.test.ts`,
    `tests/lessonWords.test.ts`, бот — `tests/telegramRecordFlow.test.ts`.
  - `npm run verify` на `7e3d6af`: Jest 112 наборов — 1870 прошли, 1 пропущен; Vitest 127 файлов, 1277; сборки webapp и
    сервера; dependency-cruiser 347 модулей без нарушений, madge без циклов.
  - Живая проверка на тестовом сервере: временная база, polling выключен, тестовый токен, настоящий ИИ, правки тем же
    `PUT { categoryId }`. «Без ИИ» подтверждено временем ответа: быстрый путь 9–21 мс, ИИ 0,6–2,4 с.

  | Сценарий | Результат |
  |---|---|
  | «zzqx 50000» → одна правка в «Продукты» → «zzqx 30000» | «Продукты?», 21 мс |
  | «wwpt 50000», «wwpt 70000» → две правки → «wwpt 30000» | «Продукты» без «?», 11 мс |
  | «KKWQ PAYNET UZCARD» → одна правка в «Кафе» | «PAYNET MOBILE» — «Связь?» от ИИ; «KKWQ PAYNET UZCARD» — «Кафе», 10 мс |
  | «ZZQX 77» → правка в «Продукты» → «ZZQX 78» | «Продукты» без «?» |
  | «WXYQ 1»: правка и «Отменить» → «WXYQ 2» | снова у ИИ |
  | правка в свою категорию → следующая оплата | у ИИ |
  | «qqrt paynet uzcard tashkent 40000» → правка | посчитано только «qqrt» |
  | «PAYNET 0123» → «Дом», «PAYNET 0456» → «Связь» (круг 2) | «PAYNET MOBILE» — «Связь?», «PAYNET KOMMUNAL GAZ» — «Дом?», обе от ИИ; «PAYNET 0789» — «Связь» без «?», 12 мс; счёт магазина 1 |

- **Отдельный агент-ревьюер** (до проверки штаба). Нашёл и исправлено в `49cde9c`:
  - категория разбора «плыла» после переименования, и «Отменить» учило;
  - урок искался по словам, а не по записи;
  - гонка записи файлов;
  - числа попадали в слова урока.

  Позиция без суммы — в FT-200.
- **Под-чат проверки, круг 1**: блокеров нет. Серьёзное — обучение слишком жадное: одна правка «KKWQ PAYNET UZCARD»
  отправляла в «Кафе» «PAYNET MOBILE» без «?». Решение штаба: магазин целиком, стоп-лист и счёт на слово. Исправлено в
  `19a4316`, `2bd40ea`, `02bcc5e` вместе с мелочами: `.gitignore`, снятие урока до выходов, урок без слов, старые
  оплаты, битые файлы.
- **Под-чат проверки, круг 2**: блокеров нет. Серьёзное — выученный магазин из оплат после двух уроков становился словом
  в `namingWordsOf`, и «PAYNET MOBILE» молча ложилась в «Связь». Исправлено в `7e3d6af`: магазины из оплат — только
  точный поиск, счёт на категорию. Заодно в стоп-лист добавлены месяцы и порядковые числа.

Известно (принятые риски):
- точный магазин сильнее словаря и своего названия категории: одна ошибочная правка «EVOS» уводит все EVOS-оплаты без
  «?», пока магазин не поправят снова (решение штаба);
- выученное общее для всех пользователей: на живом экземпляре пользователь один, но правка одного будет менять
  категории другого;
- удаление записи урок не снимает — ни «×», ни «Изменить», ни «Назад» на проверке, ни «Записано → Отменить»;
- урок старше 1000 записей истории снять нельзя;
- смена типа без явной категории урок не снимает;
- своя категория без `presetKey` не учит;
- «сто» — числительное, поэтому «СТО» (автосервис) не учится;
- после битого `patterns.json` выученное само не восстанавливается: копия `*.corrupt-<время>` остаётся рядом;
- чтение и запись файлов обучения сериализованы только внутри одного процесса;
- позиция фразы без суммы («wwpt» в «zzqx 50000 и wwpt») учит вместе с исправленной записью — FT-200.

---

### FT-185: A phrase amount with a decimal comma is read a hundred times larger

Status: done
Priority: medium
Owner: Claude Code, QA — под-чат проверки
Type: bug
Size: S

Context:
2026-10-30, первый шаг FT-179: старая команда Шукура «apple pay - kapilka» шлёт оплату Apple Pay фразой в
`POST /api/quick-capture`. Wallet отдаёт сумму как `28 000,00 UZS` — пробел между тысячами, запятая перед копейками,
код валюты после числа. Записалось **2 800 000 сум** вместо 28 000; `2 500,00` случайно разобралось верно. Та же
фраза, набранная в боте, по всей видимости, даёт то же — разбор фразы общий.

После FT-179 оплаты идут готовой суммой (FT-176) и разбор текста их не трогает, поэтому задача не срочная. Но сумма с
копейками через запятую — обычная запись денег, её пишут и руками.

Найти, где теряется запятая: быстрый путь разбора фразы, промпт или ответ ИИ, `amountReply.ts` (голое число меньше
1000 в сумах — тысячи). Запись Шукура на 2 800 000 он исправляет в Mini App сам.

Definition of Done:
- [x] Причина найдена и записана: какой путь превращает `28 000,00` в 2 800 000
- [x] `28 000,00 UZS`, `28 000,00`, `28000,00`, `1 234,50 сум`, `4,50 $`, `25 000` и `25000` дают верные суммы — и у быстрого пути, и у ИИ (настоящий ключ, живая проверка); тесты
- [x] «500» и «25к» по-прежнему 500 000 и 25 000 (`amountReply.ts`); тест
- [x] То же в боте: фраза текстом и голосом; тест или живая проверка

Реализовано 2026-10-30 (`93ad7d7`, `b991376`, `2fe3103`, `db46119`, `9500b17`, `a986293`, PR #139):
- **Причина.** Быстрый путь текста (`parseSingleAmount` в `processTextInput.ts`) читал сумму как
  `Number(token.replace(/[\s,]/g, ''))`: запятая всегда считалась разделителем тысяч, `28 000,00` → 2 800 000.
  - Фраза Шукура «Ooo Mazzali Super **Food** 28 000,00 UZS» шла быстрым путём: `food` — синоним «Кафе», и метка
    называла категорию (FT-143). До ИИ фраза не доходила.
  - «2 500,00» с магазином без слова категории ушла к ИИ, а ИИ такие суммы читает верно: 3 прогона по 16 фраз, все
    верно. Промпт не менялся.
  - То же правило было в `readTextAmounts` (сверка суммы ИИ с числом при валюте) и в `asNumber` (пометка «понял как»).
- **Одно правило чтения числа** — `readWrittenNumber` (`voiceProcessing/domain/writtenNumber.ts`). Его берут
  `parseSingleAmount`, `readTextAmounts`, `captureAssumptions` и `expandShortenedThousands`.
  - Пробелы, и неразрывные тоже, делят тысячи.
  - Запятая перед одной-двумя последними цифрами — копейки: `28 000,00` — 28 000, `4,50` — 4,5. Другая запятая делит
    тысячи: `150,000` — 150 000.
  - Точку читает `Number`. «1.234,50» и «1.234.567» — не число: быстрый путь отдаёт их ИИ.
- **Решения Шукура 2026-10-30** (после первой проверки):
  - голая дробь меньше 1000 в сумах у расхода — тысячи, с пометкой «понял как»: «кофе 1,5» — 1 500, «12,50» — 12 500,
    «0,5» — 500. Так же, как «45» и ответ на «Сколько?». Доходы и доллары — как написаны;
  - тийины округляются до целого сума, половина вверх, везде, где фраза даёт сумы (`captureMoneyOf`: текст, голос,
    ответ «Сколько?»): «1 234,50 сум» — 1 235. Доллары сохраняют центы;
  - то же в готовой оплате `/api/quick-capture/payment` (FT-176): Wallet может прислать «1 234,50 UZS».
    `wholeSumMinor` в `money.ts`; «0.49» UZS округляется в ноль и получает 400.
- `amountReply.ts` (ответ «Сколько?») и запятую, и целые сумы уже читал верно — закреплено тестами.
- **Документы:** `voice-to-transaction.md` («Как читается число фразы»), `QUICK_CAPTURE_API.md` (поле `amount` оплаты,
  «What is written»).
- **В backlog:** FT-205 (две суммы подряд склеиваются), FT-206 (точка как разделитель тысяч), FT-207 (Quick Add в боте
  читает запятую как точку).

Проверка 2026-10-30:
- **Под-чат разработки.**
  - TDD: сначала красный тест (`93ad7d7`): «Ooo Mazzali Super Food 28 000,00 UZS» — 2 800 000, «кофе 4,50 $» — 450 USD.
    Решения Шукура — так же, сначала тесты.
  - Тесты: `tests/decimalCommaAmounts.test.ts` (быстрый путь, ИИ, голос, дроби сумов), `tests/telegramAmountReply.test.ts`,
    `tests/paymentCaptureRoutes.test.ts`.
  - `npm run verify` после слияния с `main` (FT-184): Jest 113 наборов — 1932 прошли, 1 пропущен; Vitest 127 файлов,
    1277; сборки сервера и webapp; dependency-cruiser 348 модулей без нарушений, madge без циклов.
  - Живая проверка на тестовом сервере из ветки: временная база, polling выключен, тестовый токен, настоящий ИИ. Фразы шли
    в `/api/quick-capture` и в `/api/voice/text-input` (разбор бота), результаты совпали.
    - Круг 1: 21 фраза × 2 пути — все верно. Быстрый путь — уверенность 1, ИИ — 0,6–0,9. Голос (`say` → Whisper → ИИ):
      «кофе 28000 сум», «кофе 4 доллара 50 центов», «кофе 25 тысяч», «такси 500» — верно.
    - Круг 2, решения Шукура:

  | Фраза или оплата | Записано |
  |---|---|
  | «кофе 1,5» | 1 500 сум, «1,5» понял как 1 500 |
  | «обед 12,50» | 12 500 сум, «12,50» понял как 12 500 |
  | «кофе 1 234,50 сум» | 1 235 сум |
  | «кофе 28 000,00» | 28 000 сум |
  | «кофе 4,50 $» | 4,5 USD |
  | оплата `"1234.50"` UZS | 1 235 сум |
  | оплата `"4.50"` USD | 4,50 USD |

- **Под-чат проверки, круг 1**: блокеров и серьёзного нет, все пункты DoD подтверждены вживую. Сравнение `main` и PR —
  ни одна сумма не стала хуже. Два решения ушли Шукуру, мелочи — исправлены: тест с константой `NBSP`.
  - Поправка к отчёту: на `main` «кофе 1,5» давал **15 сум**, а не 15 000.

Известно (принятые риски):
- фразу с точкой («кофе 4.50 USD») быстрый путь, как и раньше, отдаёт ИИ: точку он считает концом предложения;
- голос с тийинами: «…тысяча двести тридцать четыре сума пятьдесят тийинов» Whisper слышит как «Обед 1234 сумма 50
  тиэйнов». ИИ берёт 50, правило «голое число — тысячи» делает 50 000. Запятой там нет, так тийины никто не говорит;
- две суммы подряд без слова между ними склеиваются — FT-205; точка как разделитель тысяч — FT-206; Quick Add в боте —
  FT-207;
- запись Шукура на 2 800 000 он исправляет в Mini App сам.

---

### FT-179: Apple Pay payments record themselves

Status: done
Priority: medium
Owner: Claude Code, Shukur (iPhone), QA — под-чат проверки
Type: feature
Size: M
Depends on: FT-176, FT-177

Context:
Оплаты Apple Pay — в MVP (решение 2026-10-29). «Записать оплату» — App Shortcut с суммой, валютой, магазином и
картой — есть в «Быстрых командах» сразу после установки. Автоматизацию «Транзакция» (Wallet) приложение создать не
может, iOS этого не даёт: Шукур создаёт её один раз (Быстрые команды → Автоматизация → Транзакция → карты → «Записать
оплату» → «Выполнять сразу»). В настройках приложения — эта инструкция и кнопка, открывающая «Быстрые команды».

Оплата ложится в очередь (FT-177) — сеть для этого не нужна — и уходит готовой суммой по контракту FT-176. Валюта не
сум и не доллар — не отправлять, показать в списке. В настройках — карты Wallet → счета Kapelka (новая карта
появляется сама после первой оплаты); несопоставленная уходит без счёта, сервер ставит счёт по умолчанию и «проверить
счёт». Оплату через Apple Pay голосом не повторять — будет дубль.

Первый шаг — 5 минут на iPhone (перенесено из FT-160): автоматизация «Транзакция» с действием «Показать уведомление»
показывает, что Wallet даёт для карт Шукура: формат суммы и валюты, имя магазина, название карты; включается ли
«Выполнять сразу».

Что дал Wallet (2026-10-30, уведомления Wallet и прежняя быстрая команда Шукура «apple pay - kapilka»):
- **Сумма** — «28 000,00 UZS»: неразрывные пробелы между тысячами, запятая перед копейками, код валюты после числа.
  Прежняя команда слала её фразой, и разбор текста записал 28 000,00 как 2 800 000 сум — ровно то, от чего защищают
  FT-176 и FT-179. Оплата «2 500,00 UZS» случайно разобралась верно.
- **Магазин** — юрлицо, как в банке: «Ooo Mazzali Super Food», «Ramziddin Invest Mchj», «Ooo Avtomatlashtirilgan T»;
  в уведомлении Wallet ещё город («… Ташкент»).
- **Карта** — «TBC Uzbekistan»; автоматизация стоит на «Любая из нескольких (2)».
- **«Выполнять сразу»** на iOS 18.7 работает: оплаты дошли до сервера без нажатий. Сумма и магазин от TBC приходят
  (не 0 и не пусто, как у некоторых банков).
- Не видели: текст самой переменной «Сумма» (может отличаться от уведомления) и долларовую карту. Приложение понимает
  и другие записи суммы, а непонятную не шлёт и показывает; проверка на iPhone покажет точно.

Definition of Done:
- [x] Записано, что Wallet даёт для карт Шукура (первый шаг)
- [x] «Записать оплату» есть в «Быстрых командах» и в автоматизации «Транзакция» сразу после установки
- [x] Сумма и валюта доходят без изменений; тест на формат из первого шага
- [x] Карты → счета в настройках; несопоставленная карта уходит без счёта; другая валюта не уходит и видна в списке; тесты
- [x] Инструкция автоматизации — в настройках приложения
- [x] Оплата без сети на телефоне ложится в очередь и уходит после связи, по одному разу
- [ ] Проверено на iPhone: оплата Apple Pay → запись с суммой как в Wallet, на счёт своей карты; при выключенном ПК — после включения, по одному разу — сумма и одна запись проверены 2026-10-30; счёт своей карты и выключенный ПК — только на симуляторе

Реализовано 2026-10-30 (`334ddac`, `820d3cb`, `ad891eb`, `3e5575c`, `77d2151`, `bcc25de`, `dcaae53`, PR #138):
- **Команда «Записать оплату»** (`Kapelka/Intents/CaptureShortcuts.swift`, `Kapelka/Payments/`):
  - App Shortcut с «Суммой», «Магазином», «Картой» и необязательной «Валютой»; приложение не открывает, ни о чём не
    спрашивает, так что «Выполнять сразу» проходит без нажатий;
  - `PaymentRecorder`: сначала оплата на диск, потом карта — в настройки, потом одна попытка отправить за 25 с
    (`BackgroundSend.run`);
  - **решение Шукура 2026-10-30, после его первой оплаты**: окна с «Готово» нет. Итог — одно уведомление, оно уходит
    само, нажимать нечего (`PaymentNotice`, `SystemNotices`):
    - записалось — итог сервера: «Ytt Abduvoxidov Davronbek · 25 000 сум · Другое?»;
    - нужно проверить — то же с «— проверь в Mini App»;
    - в очереди — «— нет связи, уйдёт позже», «— в очереди: укажи адрес и токен…», «— в очереди: сервер не принял
      токен…»;
    - не записалось — «— не записалось: причина»;
  - разрешение на уведомления спрашивается один раз, при открытии приложения, а не во время оплаты; отказ — оплата
    пишется тихо, итог в списке и в Mini App. Значения команда не возвращает и раньше: с ним iOS спрашивала «Allow …
    to output», когда команду запускает автоматизация. «Записать трату» и «Отправить очередь» отвечают окном, как
    были.
- **Сумма как в Wallet** (`WalletAmount`): текст → строка контракта без `Double`, «28 000,00 UZS» → `28000.00`.
  Разряды — пробел, апостроф, точка или запятая между тройками; копейки — последние точка или запятая с одной-двумя
  цифрами; валюта — код, символ или слово рядом с числом. Спорное не угадывается: «0.125 USD», «1234,567 UZS»,
  «1.500 USD» (из ревью).
- **Валюта суммы без кода**: код в сумме → валюта карты в настройках → «Валюта» автоматизации → «Не отправлено» с
  причиной (из проверки PR).
- **Не отправляется, но видна** как «Не отправлено» с причиной: другая валюта, 0, непонятный формат, нет валюты,
  больше 1 000 000 000.
- **Очередь FT-177**: оплата — запись с полем `payment`, тот же `clientId` при повторе, `capturedAt` — время оплаты.
  Уходит полями на `/api/quick-capture/payment` (`CaptureClient`); тексты 400 — по-русски (`RejectionText`).
- **Карты → счета** (`CardAccountStore`): карта появляется сама после первой оплаты; счёт — имя целиком, берётся при
  отправке; валюта карты — когда оплата ложится в очередь; несопоставленная карта уходит без `accountName`.
- **Экран**: в списке пометка «Apple Pay», пока оплата ждёт — магазин и сумма как в Wallet; в настройках — карты со
  счётом и валютой, инструкция автоматизации и кнопка «Открыть Быстрые команды».
- **Документы**: `ios/README.md` («Оплаты Apple Pay»), `docs/QUICK_CAPTURE_API.md` (сумма, ограничение 9);
  скриншоты — `docs/tasks/screens/ft-179/`.
- **FT-208** в backlog: «YTT», «ЯТТ» учатся как слова (найдено на оплате Шукура).

Проверка 2026-10-30:
- **Под-чат разработки.**
  - TDD: к каждой правке сначала красный тест; тексты уведомления — по тесту на каждый исход.
  - Swift Testing: 170 тестов в 20 наборах, на симуляторе три прогона подряд без падений; сборка без предупреждений.
  - `npm run verify` зелёный на дереве, слитом с `main` (FT-184, FT-185): Jest 113 наборов — 1932 прошли, 1 пропущен; Vitest 127 файлов, 1277; зависимостей и циклов нет.
  - Симулятор iPhone 16 Pro Max (iOS 26.4), тестовый сервер на 3177:

  | Шаг | Результат |
  |---|---|
  | карта не сопоставлена | запись на счёт по умолчанию с «проверить» |
  | «ТИС → Карта» | «Записал», без «проверить» |
  | сервер выключен | оплата ждала; после включения — одна запись |
  | «10,00 €» | «Не отправлено» с причиной, на сервер не ушла |
  | сопоставление прошлой сборки, без валюты | прочиталось; валюта карты сохранилась |
  | открыть приложение после обновления | вопрос об уведомлениях — один раз |
  | команда после решения Шукура | окна нет, даже с «Показать при запуске»; уведомление «Маззали · 25 000,00 UZS — нет связи, уйдёт позже» |
  | то же с сервером | уведомление «Маззали · 25 000 сум · Другое?»; две ждавшие оплаты ушли в том же проходе, по разу |

- **Отдельный агент-ревьюер**: «0.125 USD» уходило как 125, «1234,567» — как 1 234 567; исправлено в `3e5575c`.
- **Под-чат проверки**: блокеров и серьёзных находок нет. Правки — валюта карты, строка без суммы, скриншоты
  (`77d2151`).
- **iPhone Шукура** (iPhone 16 Pro Max, iOS 18.7.8): оплата Apple Pay 2026-10-30 в 17:16 записалась сама —
  «Ytt Abduvoxidov Davronbek · 25 000 сум · Другое?».
  - Сумма верная: 25 000, а не ×100.
  - В Mini App одна запись: старая автоматизация «apple pay - kapilka» выключена.
  - «Нужно проверить» — первая оплата, карта ещё не сопоставлена со счётом.
  - После неё iOS показывала окно с «Готово» — по решению Шукура заменено уведомлением; сборка с ним стоит на
    iPhone и ждёт следующей оплаты.

Известно:
- **Не проверено на iPhone**: уведомление вместо окна, оплата на сопоставленную карту, оплата при выключенном ПК. Всё
  это прошло на симуляторе.
- **Двойная «Транзакция».** Если автоматизация сработает дважды на одну оплату, будут две записи: у каждого запуска
  свой `clientId` (контракт FT-176). На iPhone Шукура дубля не было.
- **Сервер без FT-176** отвечает 404 на `/payment`, и оплата ждёт без конца. На ПК — `ffa75c1`, FT-176 там есть.
- **«Голосом оплату не повторяй»** — только в подписи к настройкам.
- **Siri и Spotlight** тоже запускают «Записать оплату»; без суммы она ложится «Не отправлено».
- **Запись, на которую сервер раз за разом отвечает 5xx, держит очередь** — поведение FT-177.
- **«Другое?» у ИП** — честный ответ: имя ИП категорию не называет. Одна правка в Mini App, и следующая оплата этому
  ИП идёт в её категорию (FT-184). «YTT» как слово — FT-208.
- **Подпись** бесплатного Apple ID живёт 7 дней: переустановка с мака поверх, данные остаются.

---

### FT-182: The bot dates a phrase by the time the message was sent

Status: done
Priority: low
Owner: Claude Code, QA — под-чат проверки
Type: feature
Size: S

Context:
Найдено в FT-175 (2026-10-29). Бот датирует запись днём обработки: пока ПК выключен, Telegram хранит сообщения до
24 часов, и фраза, отправленная вечером, после включения утром ложится сегодняшним днём, «вчера» — позавчерашним.
Telegram присылает время отправки (`ctx.message.date`, секунды Unix), а quick capture с FT-175 умеет `capturedAt`:
бот текстом зовёт `capture()` (`messageHandlers.ts:248`) и может передать его. Голос идёт через
`ProcessVoiceInputUseCase` — там `today` в `analyzeInput` нужно передать отдельно.

Идея: текст и голос из Telegram передают время отправки сообщения как время ввода; пределы и день — как у
`capturedAt` (`docs/QUICK_CAPTURE_API.md`, «Time of input»). Повтор апдейта после перезапуска (FT-167) уже отвечает
первыми записями.

Definition of Done:
- [x] Текст из Telegram: запись без даты — днём отправки сообщения, «вчера» — днём раньше него; тест
- [x] Голос из Telegram: то же; тест
- [x] Сообщение старше 30 дней не бывает (Telegram хранит 24 часа) — проверено, что бот не отвечает на него ошибкой
- [x] `docs/QUICK_CAPTURE_API.md` («Telegram uses the same boundary») и `voice-to-transaction.md` обновлены

Реализовано 2026-10-30 (`4bcc65d`, `9c00a7b`, `d8d4333`, PR #140):
- **Время ввода — время отправки.** `messageDay` (`telegram/utils/messageTime.ts`) берёт `message.date` (секунды
  Unix) и даёт его день по календарю пользователя (Ташкент).
  - Текст передаёт этот день в `capture()` как `inputDay` — новое поле `QuickCaptureRequest`. Сервис берёт его как
    есть, HTTP-маршрут его не ставит.
  - Голос — как `VoiceInput.today`. `ProcessVoiceInputUseCase` говорит ИИ этот день (`AnalysisContext.today`) и
    датирует им запись без даты. Раньше голос не передавал день вовсе.
  - Сумма после кнопки категории (quick-add) — тоже днём отправки. Раньше — `new Date().toISOString()`.
  - Ответ на «Сколько?» — днём фразы. Позиция без суммы и без своей даты получает день фразы при разборе
    (`parseItemWithoutAmount`), как запись (`parseTransactionItem`).
- **Решение штаба 2026-10-30, после проверки: времени Telegram бот верит всегда.**
  - Часы Telegram верны, а сообщение он хранит 24 часа. Время старше 30 дней или больше чем на сутки впереди значит,
    что врут часы сервера, и день сервера был бы неверным.
  - Такое время пишется в лог `warn` (`problem`, `aheadMinutes`), как и время впереди больше чем на 5 минут (часы WSL
    после сна). У текста, голоса и quick-add одинаково.
  - В первом варианте PR время старше 30 дней отбрасывалось, и запись ложилась днём сервера. Заменено.
  - У `/api/quick-capture` (телефон) правила FT-175 не менялись.
- `captureDayOf` (`quickCapture/domain/capturedAt.ts`) — правило дня для `capturedAt` телефона в одной функции: день
  ввода, а больше чем на сутки впереди — день сервера. Её зовёт сервис.
- **Время ввода не нужно:**
  - `edited_message` бот не читает (фильтр `message()` в telegraf), правка сообщения ничего не пишет;
  - кнопки («Изменить», «Отменить», «Вернуть») и `/undo` меняют уже записанное, его дата остаётся.
- **Документы:**
  - `QUICK_CAPTURE_API.md` — «Telegram uses the same boundary» и строка в «Time of input»;
  - `voice-to-transaction.md` — «Сообщение бота — днём отправки»;
  - `IOS_SHORTCUT_ACTION_BUTTON.md` — шаг 11 и ограничение 3 говорили «дата обработки»;
  - `live-instance.md` — одна строка.

Проверка 2026-10-30:
- **Под-чат разработки.**
  - TDD: сначала красные тесты. 10 из 12 упали на дне, прошли два, что закрепляют прежнее поведение: правка сообщения
    и сообщение без даты. Решение штаба — так же, 3 красных теста.
  - Тесты:
    - `tests/telegramMessageTime.test.ts`, 14 тестов: текст, голос, пределы, quick-add, «Сколько?», правка, кнопки.
      Настоящий SQLite и конвейеры записи, подделаны ИИ и часы;
    - `tests/capturedAt.test.ts` — `captureDayOf`, с веткой «больше суток впереди»;
    - `tests/captureWithoutAmount.test.ts` — дата позиции без суммы.
  - Тесты FT-167 (`telegramRedelivery.test.ts`) идут на поддельных часах, с настоящим днём сообщения. Раньше фикстура
    2025 года вела их по ветке «старше 30 дней».
  - `npm run verify` после решения штаба, ветка на свежем `main`: Jest 114 наборов — 1950 прошли, 1 пропущен; Vitest
    127 файлов, 1277; сборки сервера и webapp; dependency-cruiser 349 модулей без нарушений, madge без циклов.
- **Под-чат проверки, круг 1**: блокеров и серьёзного нет.
  - 15 сценариев на настоящих обработчиках и SQLite: граница дня по Ташкенту, пачка сообщений после включения, повтор
    через полночь (FT-167), «5 октября» голосом, «Сколько?». Плюс настоящий ИИ.
  - Пределы ушли штабу — решение выше.
  - Мелочи исправлены: `warn` у голоса и quick-add, фикстура FT-167, прямой тест `captureDayOf`, комментарий к
    `ItemWithoutAmount.date`.
- Живой проверки в Telegram не было: бот не может отправить сообщение от имени человека.

Известно (принятые риски):
- позиция без суммы, спрошенная до выкатки FT-182, лежит в `bot_messages` без даты. Ответ на её «Сколько?» ляжет днём
  ответа — только для вопросов, открытых до выкатки;
- если часы сервера врут больше чем на сутки, запись из бота ляжет верным днём, а итоги дня, напоминания и «Сегодня» в
  Mini App считаются по часам сервера;
- сообщение без `date` (на деле не бывает) ложится днём сервера;
- живая проверка на @FinanceTrackerDevBot: остановить бота вечером, отправить «такси 18к», запустить после полуночи.
  Запись должна лечь вчерашним днём, а в логе — ни одного `warn` про часы сервера.

---

### FT-183: Dependencies: safe updates and openai v7

Status: done
Priority: medium
Owner: Claude Code, QA — под-чат проверки
Type: chore
Size: M
Depends on: — (после FT-176…FT-179: те же lock-файлы не трогать параллельно)

Context:
2026-10-30, при обновлении ПК, `npm ci` показал 25 уязвимостей. `npm audit --omit=dev` на `main` (266ddc9):

| Где | Что | Как закрывается |
|---|---|---|
| сервер | `proxy-addr` (critical), `body-parser`, `brace-expansion` (high) — Express | `npm audit fix` без `--force` |
| сервер | `openai` (high, прямая), `zod` (high) | `openai` ^4.89 → 7.x — мажорное обновление |
| сервер | `tar` (critical), `node-gyp`, `cacache`, `make-fetch-happen` (high) — через `sqlite3` | `sqlite3` 6 — это FT-048, не здесь |
| webapp | `zod` (high) | `npm audit fix` |
| оба | dev-зависимости: в webapp 16, в корне — остальное | `npm audit fix` без `--force`, если не ломает сборку и тесты |

Сервер доступен только в tailnet и только Шукуру (FT-153), риск низкий, но держать так не стоит. `npm audit fix --force`
по правилам Stop/ask не запускать; мажорное обновление `openai` — осознанное, с проверкой разбора.

Идея:
1. `npm audit fix` без `--force` в корне и в `webapp/`; `npm run verify` зелёный.
2. `openai` → 7.x: изменения API клиента (чат, транскрипция голоса, таймауты и повторы FT-145, ошибки), тесты; живой
   разбор фраз и голоса на настоящем ключе — как раньше. Если переход тянет большую переделку — остановиться, записать
   что мешает и сделать пункт 1 отдельно.
3. `sqlite3` не трогать — FT-048.

На ПК обновление придёт через `scripts/live-update.sh` (`npm ci` по новому lock-файлу); в ПК-копии руками `npm audit fix`
не запускать — дерево станет грязным и `live-update.sh` откажется.

Definition of Done:
- [x] `npm audit --omit=dev` в корне: high/critical остались только в цепочке `sqlite3` (FT-048); в `webapp/` — ноль
- [x] `openai` 7.x: разбор текста, голос, таймаут и повтор (FT-145) — тесты зелёные
- [x] Живая проверка на настоящем ключе: 5 фраз (бот-формат и quick capture) и одно голосовое — результат как до обновления
- [x] `npm run verify` зелёный; `npm audit fix --force` не запускался
- [x] Записано в «Реализовано», какие пакеты и версии сменились

Реализовано 2026-10-31 (`cf01d50`, `1f3fe69`, `735b36f`, PR #141):
- **`npm audit fix` без `--force`.**
  - Корень — три прохода. Со второго express доехал до 4.22.3; третий, после `openai`, поднял dev-цепочку madge.
  - webapp — через `npx npm@11.21.1 audit fix`. npm 10.9.9 на нём падает: `Cannot read properties of null (reading
    'edgesOut')` в arborist `#loadPeerSet`, на необязательных peer у vite 7.3.7 (`@vitejs/devtools` → vitest → jsdom →
    canvas). npm 10 ставит такой lock с нуля, а `npm ci` и `npm install` его не меняют.
- **`openai` 4.89.0 → 7.47.0** (`^7.47.0`).
  - Для наших вызовов API тот же: опции клиента, `chat.completions.create` с `json_object`, загрузка в Whisper из
    `fs.createReadStream`, `APIConnectionTimeoutError` («Request timed out.»).
  - Код не менялся, кроме комментария у `maxRetries: 0` для голоса. openai 7 отправляет файл потоком и поток сам не
    повторяет; опция оставлена, чтобы поведение не зависело от SDK.
  - `openai` 7 требует Node 22 — `.nvmrc` уже 22.
- **`zod` 3.25.76 удалён из корня.** Он стоял от openai 4. У openai 7 `zod` — необязательный peer, но npm держит уже
  стоящий пакет. `npm uninstall zod` его не убирает: пакета нет в `package.json`. Запись `node_modules/zod` удалена из
  lock руками, и `npm install` её не возвращает.
- **Пакеты** (lock-файлы против `main` `1a0e45e`; в корне сменились 94, в webapp — 49):

  | Где | Пакет | Было → стало |
  |---|---|---|
  | корень, рабочие | `openai` | 4.89.0 → 7.47.0 |
  | | `zod` | 3.25.76 → удалён |
  | | `formdata-node`, `form-data-encoder`, `web-streams-polyfill`, `@types/node-fetch` — зависимости openai 4 | удалены |
  | | `express` | 4.22.2 → 4.22.3 |
  | | `body-parser` | 1.20.6 → 1.20.9 |
  | | `proxy-addr` | 2.0.7 → 2.0.8 |
  | | `qs` | 6.15.3 → 6.16.2 |
  | | `ip-address` | 10.5.0 → 10.7.5 |
  | | `brace-expansion` | 1.1.18, 2.1.4 → 1.1.21, 2.1.7 |
  | корень, dev | `ts-jest` | 29.3.4 → 29.4.15 |
  | | `typescript` | 5.9.2 → 5.9.3 |
  | | `shell-quote` | 1.10.0 → 1.12.0 |
  | | `fast-uri` | 3.1.5 → 3.1.9 |
  | | `js-yaml` | 3.15.1 → 3.15.2 |
  | | `dependency-tree` (madge) | 11.2.0 → 11.5.0 |
  | webapp, рабочие | `zod` | 4.3.5 → 4.6.7 |
  | webapp, dev | `vite` | 7.3.6 → 7.3.7 |
  | | `vitest` | 4.1.10 → 4.1.12 |
  | | `vite-plugin-pwa` | 1.2.0 → 1.3.0 |
  | | `eslint` | 9.39.2 → 9.39.5 |
  | | `typescript-eslint` | 8.53.0 → 8.72.1 |
  | | `browserslist` | 4.28.1 → 4.29.5 |
  | | `immer` | 10.2.0 → удалён: необязательный peer у zustand, код его не импортирует |

- **`npm audit`.** Оба столбца посчитаны 2026-10-31: за ночь вышли moderate-advisory на `glob` и `minimatch`.

  | | `main` | после |
  |---|---|---|
  | корень `--omit=dev` | 19: critical 2, high 8, moderate 7, low 2 | 12: critical 1, high 4, moderate 5, low 2 |
  | корень, всё | 52: 3 / 11 / 32 / 6 | 38: 1 / 4 / 27 / 6 |
  | webapp `--omit=dev` | 1: high 1 (`zod`) | 0 |
  | webapp, всё | 33: 0 / 7 / 23 / 3 | 21: 0 / 0 / 19 / 2 |

  2026-10-30, до новых advisory, на `main` было: корень `--omit=dev` — 14 (2 / 8 / 2 / 2), всё — 25; webapp — 1 и 16.
- **Документы:** `voice-to-transaction.md` — почему голос не повторяется; `quick-start.md` — openai 7 требует Node 22,
  а Dockerfile на `node:20-alpine`.
- **Тест:** в `openAITimeout.test.ts` тест голоса назван по тому, что проверяет: одна попытка. Она держится и без
  `maxRetries: 0`, раз openai 7 поток не повторяет; прежняя причина в названии устарела.
- **В backlog:** FT-215 (typeorm 1.x — advisory `glob` и `minimatch`) и FT-216 (голос через API оставляет файл в
  `uploads/`).

Проверка 2026-10-30…31:
- **Под-чат разработки.**
  - `npm run verify` после `npm audit fix`: Jest 1932 прошли, Vitest 1277. Первый прогон упал на четырёх таймаутах
    по 5 с — мак уснул посреди прогона; повтор под `caffeinate` чистый.
  - Итоговое дерево с нуля, как на ПК. Удалены `node_modules`, `webapp/node_modules`, `dist`, `public/webapp`, затем
    `npm ci --include=dev` на npm 10.9.9 и Node 22.23.3: postinstall сделал `npm install` в webapp и собрал её, lock-файлы
    не изменились.
  - `npm run verify` на нём: Jest 114 наборов — 1950 прошли, 1 пропущен; Vitest 127 файлов, 1277; шрифты, токены,
    dependency-cruiser (349 модулей) и madge чистые.
  - `npm run lint` в webapp — 35 замечаний, те же, что на `main` (сравнено по JSON). В `verify` lint не входит.
  - **Живая проверка на настоящем ключе**, до (openai 4.89.0, `main` `1517ba5`, 2026-10-30) и после (openai 7.47.0,
    ветка с FT-182, 2026-10-31). Сервер — `dist/` из ветки, запущенный из временной папки: своя SQLite, только
    seed-паттерны, порт 3183, `ENABLE_TELEGRAM_POLLING=false`, одноразовый токен Shortcut, владелец 900000183, ключ из
    `~/.config/daftar/dev.env`. Оба маршрута, `/api/quick-capture` и `/api/voice/text-input`, дали одни записи:
    - «вчера в корзинке продукты на 245 тысяч и такси домой 18к» → 245 000 «Продукты» + 18 000 «Транспорт», вчерашним днём;
    - «обед с коллегами в плове 180 тысяч наличными» → 180 000 «Кафе»;
    - «получил зарплату 12 млн на карту» → доход 12 000 000 «Зарплата»;
    - «заплатил за интернет 150000 и мобильную связь 50000» → 150 000 + 50 000 «Связь»;
    - «купил кроссовки за 85 долларов» → 85 USD «Покупки?», на проверку: долларового счёта нет;
    - голос (`say -v Milena` → wav → `/api/voice/voice-input`, Whisper): услышано «Купил кофе за 25 тысяч и заправился
      на 300 тысяч» → 25 000 «Кафе» + 300 000 «Транспорт?»;
    - оплаты незнакомых магазинов (`/api/quick-capture/payment`, 64 000 UZS): SAFIA BAKERY 14 → «Продукты?»,
      TEXNOMART SERGELI → «Покупки?».

    18 записей из 18 совпали по сумме, типу, валюте, категории, `needsReview` и допущениям. Даты — на сутки позже, по
    дню прогона. Различались только свободные `description` и `merchant` — это разброс модели: в прогоне «до» одна
    фраза дала разный `merchant` на двух маршрутах.
- **Под-чат проверки**: блокеров и серьёзного нет.
  - Проверил:
    - чистый `npm ci`, `verify` и `npm audit` — совпал;
    - diff lock-файлов: нет `--force` и лишних мажорных версий;
    - совместимость с openai 7: запросы v4 и v7 побайтно одинаковы;
    - живую проверку, включая недоступный ИИ: таймаут и повтор FT-145 работают как раньше.
  - Замечания исправлены: тест голоса переименован, версия отката `typescript-eslint` в FT-215 (8.14.0), FT-216 в
    backlog, счётчики доски.

Известно (принятые риски):
- в корне high/critical остались в цепочке `sqlite3`: `tar` (critical), `node-gyp`, `make-fetch-happen`, `cacache`,
  `sqlite3` — FT-048;
- в рабочих зависимостях корня moderate у `typeorm` → `glob` и `minimatch` — FT-215 (typeorm 1.x, мажорное обновление);
- в webapp 19 moderate и 2 low в dev-зависимостях (eslint, `workbox-build` через `vite-plugin-pwa`). npm чинит их только
  откатом: `vite-plugin-pwa` до 1.1.0 и `typescript-eslint` до 8.14.0. Этого не делали;
- `openai` 7 требует Node 22, а Dockerfile на `node:20-alpine`. Docker отложен вместе с production; когда он вернётся,
  поднять образ до `node:22-alpine` и проверить сборку `sqlite3` (`quick-start.md`);
- в webapp `npm audit fix` на npm 10.9.9 падает так же — запускать через `npx npm@11 audit fix`, затем проверить
  `npm ci` на npm 10;
- на ПК `npm audit fix` руками не запускать: дерево станет грязным, и `live-update.sh` откажется. Обновление придёт
  через `scripts/live-update.sh` (`npm ci` по новому lock-файлу).

---

### FT-205: Two amounts in a row without a word between them are read as one

Status: done
Priority: low
Owner: Claude Code, QA — под-чат проверки
Type: bug
Size: S

Context:
Старая ошибка, до FT-185 тоже. Число фразы ищет `AMOUNT_TOKEN` — `[+-]?\d[\d\s.,]*`. Он берёт внутрь числа любые
пробелы и запятые, поэтому две суммы подряд без слова между ними склеиваются в одну:
- «кофе 25 000, 18 000» → 2 500 018 000;
- «обед 45000 5,10» → 450 005,1.

Тот же шаблон — в `processTextInput.ts`, `captureMoney.ts` и `captureAssumptions.ts`.

Идея: пробел делит тысячи, только если за ним ровно три цифры (`28 000`, `1 234 567`); иначе число кончается. Тогда в
такой фразе две суммы, быстрый путь её не берёт, и она уходит к ИИ.

Definition of Done:
- [x] «кофе 25 000, 18 000» и «обед 45000 5,10» не склеиваются в одну сумму; тест
- [x] «25 000», «28 000,00 UZS», «1 234,50 сум», «+998 90 123 45 67» в тексте читаются как раньше; тест
- [x] Одно правило для всех трёх мест; живая проверка с ИИ

Реализовано 2026-10-31 (`d405a34`, `488a9a1`; PR #144):
- **Одно место для всех трёх.** Числа фразы находит `writtenNumbersIn` (`voiceProcessing/domain/writtenNumber.ts`). Им
  пользуются быстрый путь (`parseSingleAmount`, `readTextAmounts`), `captureMoney` и `captureAssumptions`. Три копии
  `AMOUNT_TOKEN` удалены.
- **Пробел делит тысячи** только после головы из 1–3 цифр и только перед ровно тремя цифрами. Поэтому:
  - «25 000», «1 234 567» и «25 000 300» — одно число;
  - «кофе 25 000, 18 000», «обед 45000 5,10» и «такси 25000 300» — два числа, быстрый путь их не берёт, фразу читает ИИ.
  - Вторая часть (голова 1–3 цифры) — по проверке: без неё «такси 25000 300» было 25 000 300 сум, без пометки.
- **Номер телефона с плюсом** (`+998 90 123 45 67`) — одно число, как раньше. Сверка суммы с валютой в тексте
  по-прежнему возвращает ИИ с номера на сумму «кофе 25000 сум».
- **Документ:** `voice-to-transaction.md`, «Как читается число фразы».

Проверка 2026-10-31:
- **Под-чат разработки.**
  - TDD: сначала шаблон вынесен как был, и новые тесты упали на склейке, потом правило. Тесты —
    `tests/adjacentAmounts.test.ts`.
  - Живая проверка: `dist/` из `main` и из ветки, у каждого своя временная SQLite, polling выключен, тестовый токен,
    настоящий ИИ, фразы через `/api/quick-capture` и `/api/voice/text-input`:

  | Фраза | `main` | ветка |
  |---|---|---|
  | «кофе 25 000, 18 000» | ничего: 2 500 018 000 больше предела записи | 25 000 и 18 000 |
  | «обед 45000 5,10» | 450 005 | 45 000 (ИИ не считает «5,10» суммой) |
  | «кофе 25 000, такси 18 000» | 25 000 и 18 000 | то же |
  | «кофе 25000 сум +998 90 123 45 67» | 25 000 | то же |

- **Под-чат проверки:** «можно мержить», блокеров и серьёзного нет.
  - `npm run verify`: Jest 117 наборов из 117, 2025 тестов; webapp 127 файлов, 1277 тестов.
  - 23 живые фразы через `POST /api/quick-capture` с настоящим OpenAI, таблица FT-185 не сломана.
  - Мелочь, исправленная по проверке (`488a9a1`): «такси 25000 300» и «обед 45000 500» склеивались — вторая сумма из
    ровно трёх цифр.
- **После исправлений:** `npm run verify` после слияния с `main` (PR #146): Jest 117 наборов, 2034 теста прошли, 1 пропущен; webapp 127 файлов, 1277 тестов; сборки сервера и webapp; dependency-cruiser 349 модулей без нарушений, madge без циклов.

Известно:
- Плюс и ещё две группы цифр через пробел — всегда номер телефона: «+25 000 18 000» — одно число. В записи трат так
  не пишут.
- «обед 45000 5,10» ИИ пишет одной записью на 45 000: «5,10» он не считает суммой. Склейки нет, но и второй записи тоже.

---

### FT-206: A point as a thousands separator

Status: done
Priority: low
Owner: Claude Code, QA — под-чат проверки
Type: bug
Size: S

Context:
`readWrittenNumber` (FT-185) читает точку как `Number`: «25.000» — это 25. Дальше правило «голое число меньше 1000 —
тысячи» делает 25 000, и ответ пишет «"25.000" понял как 25 000» — пометка лишняя, человек написал 25 000.

ИИ однажды прочёл «1.500» как 1,5. Ответ на «Сколько?» (`amountReply.ts`) читает «150.000» как 150 000.

Фразу с точкой быстрый путь отдаёт ИИ: точку он считает концом предложения.

Решить с Шукуром: точка перед ровно тремя цифрами — разделитель тысяч, как в ответе на «Сколько?»? Сомнительный случай —
доллары: «4.500 $».

**Решение Шукура 2026-10-31:** точка перед ровно тремя цифрами — разделитель тысяч: «25.000» → 25 000, «1.500» → 1 500,
«150.000» → 150 000, и в долларах так же («4.500 $» → 4 500 $). Точка перед одной-двумя цифрами — дробь: «4.50 $» → 4,50 $;
в сумах дробь меньше 1000 — тысячи, как решено в FT-185 («1.5» → 1 500).

Definition of Done:
- [x] Правило про точку решено и записано в `voice-to-transaction.md`
- [x] `readWrittenNumber` и промпт ИИ читают по нему «25.000» и «1.500»; тест
- [x] «"25.000" понял как 25 000» больше не показывается, если правило — «тысячи»; тест
- [x] Живая проверка с ИИ: «кофе 1.500», «такси 25.000»

Реализовано 2026-10-31 (`69a4a4f`, `99ee9cf`; PR #144):
- **`readWrittenNumber`.**
  - Точка перед ровно тремя цифрами делит тысячи: «25.000» — 25 000, «1.234.567» — 1 234 567, «1.234,50» — 1 234,50.
    Раньше два последних были «не число» и уходили к ИИ.
  - Не после нуля: «0.250» — четверть, «0.005» — 0,005. Это поправка по проверке.
  - Перед одной-двумя цифрами точка — дробь: «4.50», «1.5».
  - С `beforeMagnitude` (рядом с «к», «тыс», «млн») одна точка или запятая — дробь, как в ответе на «Сколько?»:
    «1.5к» — 1 500, «1.500 млн» — 1 500 000.
- **Быстрый путь** не считает такую точку концом предложения: «кофе 1.500» и «такси 25.000» он пишет сам, без
  «понял как».
- **Ответ на «Сколько?» и «Сумму»:** `parseAmountReply` (`amountReply.ts`) читает через `readWrittenNumber`, своего
  разбора числа у него больше нет.
- **Промпт ИИ** (RU и EN) называет правило: «25.000» = 25000, «1.500» = 1500, «4.50» = 4.5.
- **Сверка с ИИ:** `readThousandsPoint` в `captureMoneyOf` возвращает 1,5, прочитанное ИИ из «1.500», к 1 500 — и у
  дохода, и в долларах. Число, которое во фразе само читается как сумма («чай 1.5»), не трогается.
- **Документ:** `voice-to-transaction.md`, «Как читается число фразы». Решение — в `decisions.md`, 2026-10-31.

Проверка 2026-10-31:
- **Под-чат разработки.**
  - TDD: тесты — `tests/pointThousands.test.ts`. Тест FT-185 «reads no number» поправлен: по правилу точки
    «1.234.567» и «1.234,50» теперь числа.
  - Живая проверка — та же, что у FT-205:

  | Фраза | `main` | ветка |
  |---|---|---|
  | «кофе 1.500», «такси 25.000», «кофе 150.000» | верно, но с «"…" понял как» | верно, без пометки, быстрым путём |
  | «кофе 4.500 $» | 4,5 $ | 4 500 $ |
  | «кофе 4.50 $» | 4,5 $ | то же |
  | «кофе 1.5» | 1 500, «понял как» | то же |
  | «кофе 1.500 и такси 25.000» | 1 500 и 25 000, обе с пометкой | без пометок |
  | «подписка 4.500 $ и кэшбэк 1.500» | 4,5 $ и 1,5 $ | 4 500 $ и 1 500 сум |
  | таблица FT-185: «28 000,00 UZS», «1 234,50 сум», «4,50 $», «25к», «3,2 млн», «1.5к», «500» | 28 000 · 1 235 · 4,5 $ · 25 000 · 3 200 000 · 1 500 · 500 000 | то же |

  - Сам ИИ, по 2 прогона: с промптом `main` «подписка 4.500 $» — 4,5 $, с промптом ветки — 4 500 $. «1.500» и
    «25.000» оба промпта читают как 1 500 и 25 000.
- **Под-чат проверки:** «можно мержить», блокеров и серьёзного нет.
  - Вживую: «кофе 1.500» — 1 500, «кофе 4.500 $» — 4 500 $, «1.500 млн» — 1 500 000, «кофе 4.50 $» — 4,5 $; FT-185 не
    сломан.
  - ИИ читает «точку и три цифры» сам, без поправки `readThousandsPoint`.
  - Мелочь, исправленная по проверке (`99ee9cf`): ведущий ноль читался как группа тысяч. «чаевые 0.250 $ и кофе 25к» —
    ИИ вернул 0,25 $, а `readThousandsPoint` сделал 250 $; «0.005» было 5, «0.250 $» в ответе на «Сколько?» — 250 $.
- **После исправлений:** `npm run verify` после слияния с `main` (PR #146): Jest 117 наборов, 2034 теста прошли, 1 пропущен; webapp 127 файлов, 1277 тестов; сборки сервера и webapp; dependency-cruiser 349 модулей без нарушений, madge без циклов.

Известно:
- «чай 1.5 и кофе 1.500»: пропадает пометка «"1.5" понял как 1 500» у чая. Другое число фразы, «1.500», читается как
  та же сумма, и пометка решает, что написано как есть.
- `parseAmountReply` стал мягче к странному вводу: «28000,» — теперь 28 000, «1,2,3» — 12 300. Раньше это было
  «не сумма»; во фразе `readWrittenNumber` так читал и с FT-185.

---

### FT-207: Quick Add in the bot reads a comma as a decimal point

Status: done
Priority: low
Owner: Claude Code, QA — под-чат проверки
Type: bug
Size: S

Context:
После кнопки категории бот ждёт сумму (`awaiting_amount`, `handleQuickAddAmount` в `messageHandlers.ts`). Сумму он читает
так: `text.replace(/[^\d.,]/g, '').replace(',', '.')`, затем `parseFloat`. Поэтому:
- «150,000» → 150;
- «1,500» → 1,5.

Сначала проверить, где Quick Add ещё доступен после «Пастели».

Идея: читать ответ, как ответ на «Сколько?» (`parseAmountReply`, FT-122): «150к», «нал», голое число меньше 1000 —
тысячи, целые сумы. Если это меняет поведение — спросить Шукура. Минимум — `readWrittenNumber` (FT-185).

Definition of Done:
- [x] «150,000» → 150 000, «1,500» → 1 500, «28 000,00» → 28 000; тест
- [x] «500» и «25к» — по выбранному правилу; тест
- [x] Описано, где Quick Add доступен

Реализовано 2026-10-31 (`99ea504`, `ab2058b`; PR #144):
- **Где доступен.** Quick Add открывает только кнопка `quickadd:<id>`. С FT-124 (2026-10-20) её не шлёт ни одна
  клавиатура: такие кнопки остались лишь в старых сообщениях бота разработки `@FinanceTrackerDevBot`. Живой бот Kapelka
  их не посылал никогда. Сессия, которая ждёт сумму (`awaiting_amount`), живёт в памяти и закрывается перезапуском.
- **Чтение суммы.** `handleQuickAddAmount` читает её через `parseAmountReply`, как ответ на «Сколько?»:
  - «150,000» и «150к» — 150 000; «1,500» — 1 500; «28 000,00» — 28 000;
  - голое «500» — 500 000 сум, и подтверждение пишет «"500" понял как 500 000 сум» (`assumed`);
  - сумы целые;
  - «60$» — доллары: без долларового счёта запись ждёт проверки (`allowCurrencyMismatch`);
  - «18к нал» — на счёт наличных (`accountHint`);
  - ноль и минус — «Сумма должна быть больше нуля.»;
  - не сумма («кофе 25000») ничего не пишет, бот просит сумму ещё раз.
- **Решение** «500 — это 500 000» принял штаб, а не Шукур: путь до живого бота не доходит. Запись в `decisions.md`,
  2026-10-31.
- **Документ:** `voice-to-transaction.md`, «Quick Add бота».

Проверка 2026-10-31:
- **Под-чат разработки.**
  - TDD: тесты — `tests/telegramQuickAdd.test.ts`, настоящий обработчик текста. Красный тест показал саму ошибку:
    «150,000» — 150.
  - `tests/telegramRedelivery.test.ts`: «500» после кнопки теперь 500 000 сум.
  - Живьём в боте не проверено: polling выключен, настоящий токен бота не трогаем.

  | Ответ после кнопки | Было | Стало |
  |---|---|---|
  | 150,000 · 1,500 · 28 000,00 | 150 · 1,5 · 28 000 сум | 150 000 · 1 500 · 28 000 |
  | 500 · 25к | 500 · 25 сум | 500 000 с «понял как» · 25 000 |
  | 60$ · 18к нал | 60 · 18 сум | 60 $ · 18 000 на счёт наличных |
  | -5000 | 5 000 сум | «Сумма должна быть больше нуля.» |

- **Под-чат проверки:** «можно мержить», блокеров и серьёзного нет.
- **После исправлений:** `npm run verify` после слияния с `main` (PR #146): Jest 117 наборов, 2034 теста прошли, 1 пропущен; webapp 127 файлов, 1277 тестов; сборки сервера и webapp; dependency-cruiser 349 модулей без нарушений, madge без циклов.

Известно:
- Не сумма держит Quick Add открытым: бот просит сумму, пока её не напишут. Ответ на «Сколько?» в таком случае
  закрывает вопрос и отдаёт текст разбору фразы. Путь мёртвый, поэтому не трогали.
- Ответы `not_positive` и `too_big` разбираются одинаково в трёх местах: «Сумму», «Сколько?» и Quick Add. Два из них
  на редком или мёртвом пути, общий помощник не выносили.

---

### FT-172: Redelivered Telegram updates: remaining edges

Status: done
Priority: low
Owner: Claude Code, QA — под-чат проверки
Type: reliability
Size: S

Context:
Найдено при проверке FT-167 (2026-10-29). Сообщение, которое Telegram прислал снова после перезапуска, охранник
(`createRepeatedMessageGuard`, `messageHandlers.ts`) узнаёт по client id `tg-<bot>-<chat>-<message>`: по записям с этим
id и по `answeredBy` в сообщениях бота. Повтор случается, только если обработчик не уложился в 5 с остановки или
процесс убит. Остались три края:
- Повторный `/undo` после перезапуска отменяет ещё одно сообщение (`recordHandlers.ts:420`, `handleUndo`): команда
  записей не создаёт, и охранник её не видит.
- Подтверждение от охранника (`messageHandlers.ts:132`) уходит без `missing`, `heard`, `guessed` и `assumed`: если
  первое подтверждение фразы из нескольких позиций не ушло, вопрос «Сколько?» о позиции без суммы теряется, у голоса нет
  «Расслышал», у угаданной категории нет «?».
- `answeredBy` помнит только последний ответ на вопрос сообщения бота и ищется в последних 20 сообщениях бота
  (`RECENT_MESSAGES_LIMIT`): два ответа в одной пачке или ответ дальше 20 сообщений охранник не узнает.

Definition of Done:
- [x] Повторный `/undo` после перезапуска ничего больше не отменяет; тест
- [x] Подтверждение повторённой фразы, первое подтверждение которой не ушло, спрашивает «Сколько?» и показывает
      «Расслышал», «?» и «понял как» так же, как первое; тест
- [x] `answeredBy` узнаёт повтор и после второго ответа на вопрос того же сообщения; или решено и записано, что одного
      ответа и 20 сообщений хватает — `answeredBy` заменён таблицей `handled_messages`: любое число ответов, сообщение
      любой давности; тесты

Реализовано 2026-10-31 (`4564df2`, `cd845d3`, `9351510`, PR #143):
- **Таблица `handled_messages`** (миграция `HandledMessages1762700000000`). В ней сообщения чата, которые бот
  обработал, по client id `tg-<bot>-<chat>-<message>`; строка живёт два дня (`HANDLED_MESSAGE_DAYS`). Поля:
  - `bot_message_id` — сообщение бота, которое изменил ответ на «Сумму», на крупную сумму или `/undo`;
  - `confirmation` — подтверждение записей, сохранённое перед отправкой.

  Почему таблица: подтверждение нужно сохранить до того, как у сообщения бота появится id Telegram, а в
  `bot_messages` его некуда положить. Миграция переносит старые `answeredBy` из `bot_messages.state`; откат удаляет
  таблицу и `state` не трогает.
- **`/undo`** помечается до любых изменений, а то, что он отменяет, сохраняется в `state.undone` до самой отмены.
  Повтор (`finishRepeatedUndo`) берёт только своё сообщение:
  - не успел сохранить — делает отмену там;
  - сохранил — доотменяет сохранённое и отвечает;
  - ответ ушёл — ничего не делает.
- **Подтверждение** сохраняется перед `ctx.reply`. Сбрасывается сразу после `remember`, до закрытия других вопросов
  чата, или когда отправка кончилась иначе. Повтор, чьё первое подтверждение не ушло, шлёт сохранённое
  (`sendKeptConfirmation`): с «Сколько?», «Расслышал», «?» и «понял как»; крупная сумма — с удержанными записями.
- **Ответ на «Сумму»** помечается после правки записи, но до закрытия вопроса. Повтор либо пропускается, либо снова
  отвечает на открытый вопрос той же суммой.
- Охранник (`createRepeatedMessageGuard`) ищет по первичному ключу, без лимита в 20 сообщений; `answeredBy` из домена
  убран.
- Строки старше двух дней убираются при каждой записи, best-effort: сбой уборки не ломает ответ.
- Документы: `modules.md`, `runtime-process-mode.md`, `voice-to-transaction.md`, `database-guide.md`, `CLAUDE.md`.

Проверка 2026-10-31:
- **Под-чат разработки.**
  - `npm run verify` до правок проверки: Jest 114 наборов, 1964 теста. После правок и мержа `main`: Jest 114 наборов,
    1970 прошли, 1 пропущен; Vitest 127 файлов, 1277; dependency-cruiser и madge чистые.
  - `telegramRedelivery.test.ts` — настоящий SQLite с перезапуском:
    - повторный `/undo`, `/undo` без ушедшего ответа;
    - фраза, подтверждение которой не ушло: повтор побайтно как первое;
    - голос: «Расслышал» без повторной загрузки;
    - крупная сумма;
    - два ответа на «Сумму», ответ дальше 20 сообщений;
    - окна №1–3: шаг, который не возвращается, стоит за убийство процесса. 5 из 6 таких тестов красные на коде до
      правок.
  - `botMessages.test.ts`: хранение, уборка через 2 дня и её сбой, перенос `answeredBy`, откат.
- **Под-чат проверки**: «можно мержить», блокеров и серьёзного нет. `verify`: 114 наборов, 1964 теста, webapp 127 / 1277.
  Миграция на копии старой базы мака:

  | Шаг | Итог |
  |---|---|
  | `migration:run` | 22 применённые миграции, схема совпадает с сущностями |
  | `migration:revert` | чисто |
  | `migration:run` снова | расхождений нет |
  | строки до и после | transactions 73, bot_messages 12, notifications_log 14, users 10, accounts 13, categories 144, goals 2, audits 1 — сходятся; `integrity_check` ok |
  | перенос `answeredBy` | проверен на синтетике |

  Проверка воспроизвела окна №1–3 — убийство процесса между двумя записями SQLite:
  1. `/undo` между отменой и отметкой: повтор отменял и предыдущее сообщение;
  2. ответ на «Сумму» между `save` и отметкой: повтор записывался новой фразой — регресс против `answeredBy`;
  3. «Сколько?» фразы без суммы между `remember` и сбросом копии: вопрос приходил второй раз.

  Все три закрыты в `cd845d3`.
- **Повторная проверка** (head `e97b50a`): «можно мержить». `verify`: Jest 114 наборов, 1970 тестов; webapp 127 / 1277.
  Окна №1–3 воспроизведены снова и закрыты; «`/undo` помечен, процесс убит до сохранения `undone`» — повтор доделывает
  отмену своего сообщения, предыдущее не трогает. Код миграции с первой проверки не менялся — её цифры в силе.

Известно (принятые риски):
- не ушедшее «Сумма изменена» повтор не досылает, как и в FT-167 (`messageHandlers.ts:155`);
- если процесс убит между записью записей и `keepConfirmation`, повтор придёт обычным подтверждением, без «Сколько?» и
  «Расслышал»;
- если процесс упал после отправки, но до отметки, придёт второе подтверждение или второе «Отменил…»: узнать, дошло ли
  сообщение, нельзя.
- между `remember` и сбросом копии подтверждения (две записи SQLite подряд, без сети) у фразы без суммы «Сколько?» может
  прийти второй раз — воспроизведено повторной проверкой, тот же класс, что пункт выше;
- `/undo` после поштучного «Вернуть» или возврата в Mini App: если процесс убит до `save`, повтор видит старый
  `undoMessageId` и молча ничего не делает — `/undo` теряется, двойной отмены нет (вывод из кода). Чинить — признак
  «ответ ушёл» держать в строке `handled_messages`, а не в `state`.

---

### FT-173: Missed subscription and audit notices leave a trace

Status: done
Priority: low
Owner: Claude Code, QA — под-чат проверки
Type: reliability
Size: S

Context:
Найдено при проверке FT-164 (2026-10-29). FT-164 оставляет след `failed` с причиной у уведомления, которое пробовали и
которое не ушло до конца окна, а у итога дня — и когда бот не работал весь вечер («не ушло: ни одной попытки», затем
«Итоги за вчера»). Напоминание о подписке (её день, `subscription`, период `<id цели>:<день>`) и зов на ревизию
(1-е число, `audit`) при боте, выключенном весь их день, не оставляют строки: на следующий день источник
(`getListGoalRemindersUseCase`, `isAuditCallDue`) их уже не отдаёт, и тик о них не знает. Догонять их не нужно (решение
2026-10-29), нужен только след.

Definition of Done:
- [x] Подписка с «Напомнить», чей день прошёл без единого тика, получает строку `failed` «не ушло: ни одной попытки»; тест
- [x] Ревизия 1-го числа, пропущенная целиком, получает такую же строку, если в тот день было что звать (`open`, `left > 0`); тест
- [x] Ничего не отправляется задним числом; «не больше одного раза» не меняется

Реализовано 2026-10-31 (`f16f214`, `9351510`, `13248dd`, PR #143):
- Первый тик дня на пользователя (`RemindersNotifier.closeOverdue`) смотрит вчерашний день (`markMissed`):
  - подписка с «Напомнить» без строки `<id цели>:<вчера>`;
  - ревизия 1-го числа без строки месяца, если было что звать (`open`, `left > 0`).

  Такие напоминания занимаются в ожидании (`waiting`) с последним днём «вчера», и тут же `closeExpired` закрывает их
  `failed` «не ушло: ни одной попытки». Задним числом ничего не уходит; при выключенной настройке следа нет. Если
  вчерашний день не прочитался, сбой пишется в лог и не мешает сегодняшним напоминаниям.
- `isAuditDay` в `reminders.ts`.
- Документы: `modules.md`, `CLAUDE.md`.

Проверка 2026-10-31:
- **Под-чат разработки.** `botReminders.test.ts`:
  - подписка: день без тика после 10:00 даёт строку; перезапуск и следующие тики ничего не отправляют;
  - ревизия с тратами на проверку даёт строку;
  - нечего звать или настройка выключена — строки нет;
  - ушедшее в свой день не трогается;
  - сбой чтения вчерашнего дня — сегодняшняя цель всё равно уходит.

  `verify` — как у FT-172.
- **Под-чат проверки**: «можно мержить», блокеров и серьёзного нет.

Известно (принятые риски):
- настройки берутся сегодняшние, поэтому включённое сегодня даёт ложный `failed` за вчера, без отправки
  (`remindersNotifier.ts:229/236`);
- смотрится только вчерашний день, как у итогов дня: после нескольких дней без бота след будет только за последний.

---

### FT-174: Dead admin routes without requireAuth

Status: done
Priority: low
Owner: Claude Code, QA — под-чат проверки
Type: repo-hygiene
Size: S

Context:
Найдено при проверке FT-162 (2026-10-29). `requireAdmin` смотрит на `req.telegramUser`, а его ставит только
`requireAuth`, которого перед этими маршрутами нет. Поэтому с 2026-01-22 они всегда отвечают `401` (fail-closed):
- `GET /api/transactions/analytics` — `transactionController.ts:96`;
- `GET /api/openai/usage`, `GET /api/openai/usage/summary`, `POST /api/openai/usage/refresh` — `openAIUsageRoutes.ts:14,17,20`.

Дыры нет, но это мёртвый код, который выглядит рабочим. Webapp и бот эти маршруты не вызывают.

Definition of Done:
- [x] Маршруты убраны — или перед `requireAdmin` стоит `requireAuth`, и есть тест: без входа `401`, не админ `403`,
      админ `200` — убраны; тест: `404`
- [x] `auth-user-resolution-boundary-matrix.md` и `api-route-coverage-matrix.md` обновлены

Реализовано 2026-10-31 (`51e84c9`, `abfb35c`, PR #145):
- **Решено убрать, а не чинить**: маршруты никто не вызывал — ни webapp, ни бот, ни скрипты. Вместе с ними ушло то, у
  чего не осталось входа:
  - `OpenAIUsageModule` целиком (`src/modules/openai-usage/`): эти маршруты были его единственным входом. Модулей
    теперь 15;
  - `OPENAI_ORG_ID` в `AppConfig` — приложение её больше не читает;
  - `AnalyticsService.getSummary()` и `getCategoryBreakdown()` по всем пользователям, с их тестами.
- Пользовательская аналитика `/analytics/summary/:userId` и соседние маршруты остались. `repository.getAll()` тоже
  остался: на него опираются тесты.
- `buildServer` больше не принимает позиционный параметр `openAIUsageModule`; три теста поправлены.
- Тест `tests/deadAdminRoutes.test.ts`: `/api/openai/usage*` отвечают `404`, у роутера транзакций нет своего
  `GET /analytics`, пользовательские `/analytics/...` на месте.
- Документы: обе матрицы, `CLAUDE.md` и `modules.md` (15 модулей), `overview.md`, `knowledge-base/README.md`,
  `code-map.md`, `api-lifecycle.md`, `BACKEND_STANDARDS.md`, `README.md`, `VISION.md`. Про `OPENAI_ORG_ID` записано в
  `quick-start.md` и шаблонах env: SDK подхватит её сам, на живом экземпляре не задавать.

Проверка 2026-10-31:
- **Под-чат разработки**: `npm run verify` — Jest 117 наборов, 1980 тестов; webapp 127 / 1277; dependency-cruiser и
  madge чистые.
- **Под-чат проверки** (две проверки): «можно мержить». Вживую:
  - удалённые маршруты отвечают `404`;
  - `/analytics/summary/:userId` отвечает `200`;
  - с заданной `OPENAI_ORG_ID` сервер стартует.

  CI pass.

Известно (принятые риски):
- SDK `openai` сам читает `OPENAI_ORG_ID` из окружения: с неверным значением запросы падают `401`, так было и до
  FT-174. Приложение её не читает; на живом экземпляре её лучше не задавать.

---

### FT-208: Uzbek legal forms «YTT», «ЯТТ» are taught as words

Status: done
Priority: low
Owner: Claude Code, QA — под-чат проверки
Type: bug
Size: S

Context:
Wallet называет магазин так, как он записан в банке: «Ooo Mazzali Super Food», «Ytt Abduvoxidov Davronbek». «YTT»
(«ЯТТ», «YaTT», yakka tartibdagi tadbirkor) — индивидуальный предприниматель, служебное слово, как «ООО». iOS магазин
не трогает, только убирает лишние пробелы; это работа сервера.

FT-184 уже не учит формам юрлиц: `SERVICE_WORDS` в `lessonWords.ts` — `ooo`, `ооо`, `llc`, `mchj`, `мчж`, `chp`, `чп`…
Узбекских `ytt`, `yatt`, `ятт`, `duk`, `дук` там нет. Двухбуквенные `xk`, `aj`, `ип` и так отсекает `namesNothing`.

Что будет: две правки категории у фраз с «YTT …» в одну категорию научат слово «ytt» наверняка
(`MIN_WORD_LESSONS`). После этого оплата любого ИП уйдёт в эту категорию по словам, без «?»: `categoryNamedBy`
в `recordPayment.ts` с `learnedCategoryWords`. Правка самой оплаты учит магазин целиком (`merchantKey`) — с ней беды нет.

«Другое?» у «Ytt Abduvoxidov Davronbek» — честный ответ: имя ИП категорию не называет. Одна правка в Mini App, и
следующая оплата этому ИП идёт в её категорию (FT-184, `learnedMerchants`).

Можно заодно: `merchantKey` без формы юрлица, чтобы «YTT X» и «ЯТТ X» были одним магазином. Ключи считаются при чтении
(`merchantCategories`), так что выученные магазины не теряются.

Definition of Done:
- [x] `ytt`, `yatt`, `ятт`, `duk`, `дук` в `SERVICE_WORDS`; тест: правка фразы «ytt zzqx 25000» не учит «ytt» — в
      `legalForms.ts`, их проверяет `namesNothing`, который `lessonWordsOf` применяет наравне с `SERVICE_WORDS`
- [x] Решено про `merchantKey` без формы юрлица; если да — тест «YTT X» = «X» — да; тесты

Реализовано 2026-10-31 (`1277768`, `0175020`, `abfb35c`, PR #145):
- **Формы юрлиц — в `voiceProcessing/domain/legalForms.ts`.** Туда перенесены «ООО», «MChJ»/«МЧЖ», «ЧП», «LLC»… из
  `SERVICE_WORDS` и добавлены `ytt`, `yatt`, `ятт`, `duk`, `дук`.
- **Форма юрлица теперь «ничего не называет» (`namesNothing`):**
  - правка фразы её не учит;
  - уже выученное её не даёт — ни ключевое слово старого паттерна (`namingWordsOf`), ни слово урока до FT-208
    (`lessonWordsByCategory` проверяет при чтении).
- **`merchantKey` без формы юрлица — да.** «YTT X», «ЯТТ X» и «X» — один магазин. Ключи считаются при чтении, поэтому
  магазин, выученный с формой, находится по новому ключу.
- **Дубли после проверки (`0175020`).** Выученные порознь «korzinka» и «ytt korzinka» теперь на одном ключе:
  - правка сливает оплатные паттерны этого ключа в один, со всеми псевдонимами;
  - «Отменить» находит в истории уроки обоих написаний;
  - пока магазин не поправили снова, побеждает псевдоним, записанный как сам ключ;
  - паттерны seed и обучения до FT-184 не трогаются.
- Тесты: `lessonWords`, `categoryGuess`, `categoryCorrectionLearning`, новый `merchantLessons`.
- Документы: `voice-to-transaction.md`, `QUICK_CAPTURE_API.md`.

Проверка 2026-10-31:
- **Под-чат разработки**: `verify` — как у FT-174. 4 из 5 тестов `merchantLessons` красные на хранилище до правки.
- **Под-чат проверки** (две проверки): «можно мержить». Вживую:
  - сценарий Korzinka: на `main` выучены «Korzinka» → «Покупки» и «YTT Korzinka» → «Продукты». До правки оплата
    «Korzinka» шла в «Продукты», а правка в «Транспорт» не применялась. После `0175020` все три написания —
    «Korzinka», «YTT Korzinka», «ЯТТ Korzinka» — идут в «Транспорт»;
  - простой случай «YTT Zzqx».

Известно (принятые риски):
- отмена правки собирает паттерн по последнему оставшемуся уроку истории, поэтому слитый магазин может уйти не в ту
  категорию, что была до правки;
- двухбуквенные формы, кроме «ЧП» («ИП», «XK», «AJ»), ключ магазина оставляет: «XK Zzqx» и «Zzqx» — два магазина.

---

### FT-216: Voice through the API leaves its upload in `uploads/`

Status: done
Priority: low
Owner: Claude Code, QA — под-чат проверки
Type: bug
Size: S

Context:
`POST /api/voice/voice-input` принимает файл через multer (`dest: 'uploads/'`, имя без расширения) и отдаёт путь в
`ProcessVoiceInputUseCase`. Тот конвертирует файл в `<путь>.mp3` и в `finally` (`processVoiceInput.ts:303-310`) удаляет
только один файл:
- конвертация удалась — удаляется `.mp3`, исходник multer остаётся в `uploads/`;
- ffmpeg упал и запасной путь переименовал исходник в `.mp3` — удаляется исходник, которого уже нет, и остаётся `.mp3`.
  Так и у бота: он после разбора удаляет свой скачанный файл (`messageHandlers.ts:388`, `cleanupFile` из
  `fileDownloader.ts`), а `.mp3` остаётся в `downloads/`.

При живой проверке FT-183 после каждого голосового в `uploads/` оставался исходный wav (180 108 байт), и с `openai` 4,
и с 7. `uploads/` нет в `.gitignore` (там только `downloads/`). Значит, на ПК такой файл делает дерево грязным, и
`scripts/live-update.sh` откажется обновлять. Сейчас маршрут никто не зовёт: голос в Mini App пока «скоро» (FT-117).

Идея: `finally` удаляет и исходник, и `.mp3`, каждый — если он есть; `uploads/` — в `.gitignore`, как `downloads/`.

Definition of Done:
- [x] После голосового через `/api/voice/voice-input` в `uploads/` пусто — и когда конвертация удалась, и на запасном пути; тест
- [x] У бота на запасном пути `.mp3` не остаётся в `downloads/`; тест
- [x] `uploads/` в `.gitignore`

Реализовано 2026-10-31 (`304d37f`, `0411812`, PR #145):
- `ProcessVoiceInputUseCase` в `finally` удаляет и голос, и `.mp3` — какой из них есть (`removeVoiceFile`, `ENOENT`
  не ошибка). Так при удачной конвертации, на запасном пути и при ошибке.
- `POST /api/voice/voice-input`:
  - разбирает голос, удаляет загрузку и только потом отвечает;
  - загрузку, которую отклонил `writeAsSignedInUser` (`403` за чужой `userId`, `400` за пустой), удаляет
    `removeUploadOnceAnswered` по `res.on('close')`.

  Папку загрузки можно задать (`uploadDir`) — для тестов; по умолчанию `uploads/`.
- `uploads/` — в `.gitignore`, как `downloads/`.
- Тест `tests/voiceUploadCleanup.test.ts`: настоящий HTTP и временная папка, ffmpeg подменён. Случаи: конвертация,
  запасной путь, пустой файл, `403`, `400`; у бота — запасной путь и ошибка расшифровки.
- Документы: `voice-to-transaction.md`, `api-route-coverage-matrix.md`.
- В backlog — FT-222: два одинаковых голосовых сразу делят один файл в `downloads/` (`0c64e7f`, `3e95a7f`).

Проверка 2026-10-31:
- **Под-чат разработки**: `verify` — как у FT-174. Тесты `403` и `400` красные без `removeUploadOnceAnswered`.
- **Под-чат проверки** (две проверки): «можно мержить». Тест пустой загрузки зелёный в двух полных прогонах. Вживую
  `uploads/` пуст во всех случаях: `200`, `403`, три разных `400` и обрыв клиентом.

Известно (принятые риски):
- `removeUploadOnceAnswered` слушает `close`, поэтому при обрыве клиентом файл теоретически удаляется до старта ffmpeg.
  Вживую не воспроизвелось, на Linux не мешает;
- гонка голосовых с одним `file_id` — FT-222.

---

### FT-219: iOS records client: pages, cache, delete, category

Status: done
Priority: high
Owner: Claude Code, QA — под-чат проверки
Type: feature
Size: M
Depends on: — (параллельно с FT-218: контракт описан в `docs/pastel/api.md`; с живым сервером — в FT-220)

Context:
Решение Шукура 2026-10-31 (`docs/tasks/decisions.md`). Сейчас приложение умеет только отправлять: `CaptureClient` в
`ios/Kapelka/Queue/` шлёт `POST /api/quick-capture`. Эта задача — слой без экранов, на котором встанут FT-220 и FT-221:
- запросы с теми же адресом и токеном, что у очереди (`SettingsStore`, `KeychainTokenStore`, `HTTPTransport`):
  `GET /api/transactions?cursor&limit`, `GET /api/categories`, `GET /api/accounts` (имя счёта для строки FT-220,
  решение 2026-10-31 после первой версии PR), `DELETE /api/transactions/:id`, `POST …/:id/restore`, `PUT …/:id` с
  `{ categoryId }`;
- модели записи и категории по `docs/pastel/api.md` (история — строка 194 и дальше; категория — `{ id, name, type }`,
  `isHidden`);
- кэш: первая страница и время обновления — файл рядом с очередью (`Application Support/Kapelka/`). Правки в очередь не
  кладём (решение);
- ответы: 2xx; 401 и 403 — «проверь токен», как у очереди; 404 на удаление или правку — «запись уже удалена»; нет сети,
  таймаут, 5xx — «нет связи», список из кэша;
- сумма как в Mini App: знак, разряды неразрывными пробелами, «сум» или «USD» (`docs/pastel/money-model.md`,
  `formatMinor`). Сначала было «$»; после проверки штаб решил «USD»: один продукт, `design-system.md`.

Definition of Done:
- [x] Клиент читает страницу истории с курсором и категории, удаляет, возвращает и меняет категорию; заголовок токена
      как у очереди; тесты на `FakeTransport`
- [x] Клиент читает список счетов (`accounts()`, `GET /api/accounts`): из счёта — только `id` и `name`; ошибки — как у
      категорий; тесты на `FakeTransport` и на пример из `api.md`
- [x] Модели декодируют пример ответа из `docs/pastel/api.md`; тест
- [x] Первая страница и время обновления сохраняются на диск и читаются без сети; тест
- [x] 401/403, 404, нет сети, таймаут, 5xx разобраны, как в Context; тесты
- [x] Суммы: «−25 000 сум», «+1 200,50 USD»; тест
- [x] Экраны не меняются; токена нет в логах; `ios/scripts/test.sh` зелёный

Реализовано 2026-10-31 (`8a25960`, `649d37c`, `7030813`, `d57a884`, PR #147), всё в `ios/Kapelka/Records/`:
- **`RecordsClient`** — шесть маршрутов токена (FT-218): `page(after:limit:)`, `categories()`, `accounts()`,
  `delete`, `restore`, `setCategory(_:of:)` с телом только `{ categoryId }`.
  - Адрес и токен — из `SettingsStore`, как у очереди. Заголовок `X-Shortcut-Capture-Token`, `URLSessionTransport.shared`,
    таймаут 15 с; без повторов и без очереди правок.
  - id записи идёт одним сегментом пути (`appending(component:)`), `/` кодируется.
- **`RecordsFailure`** — разбор ответов с текстом для экрана:
  - `notConfigured` — нет адреса или токена, запрос не уходит;
  - `tokenRefused` — 401, 403;
  - `recordGone` — 404 с собственным `NOT_FOUND` «Transaction not found» на удаление, возврат и правку;
  - `categoryGone` — 404 «Category not found» на правку: запись жива, устарел список категорий;
  - `unreachable` — нет сети, таймаут, 5xx, 408, 429, 3xx, ответ 2xx не от Kapelka, 404 без записи (нет маршрута, прокси);
  - `refused` — прочие 4xx, с текстом сервера для журнала.
- **Модели** `Record`, `RecordCategory`, `RecordAccount { id, name }`, `RecordsPage`. Обязательны у записи только `id`,
  `date`, `type`, `amountMinor`; остальное — с умолчаниями сервера (нет `currency` — `UZS`). Нечитаемый элемент
  выпадает из списка, а не роняет страницу: `LossyList` читает каждый элемент через обёртку, которая не падает, и пишет в
  журнал только число пропущенных.
- **`RecordsFeed` и `RecordsCacheFile`** — первая страница и время обновления в
  `Application Support/Kapelka/records.json`, рядом с `captures.json`.
  - Кэш привязан к адресу сервера: страница другого адреса не показывается. Битый файл — как его нет.
  - Без сети `refresh()` отдаёт `.saved(копия, причина)`; `saved()` читает диск без сети.
  - Правки, которые подтвердил сервер, правят кэш: удаление (и 404 на него) убирает запись, «Вернуть» ставит её на место
    по порядку сервера, смена категории заменяет её ответом сервера. Подтверждённые, пока обновление в пути,
    накладываются на пришедшую страницу.
  - У каждого обновления номер: страница более раннего обновления, пришедшая после сохранённой страницы более позднего,
    не сохраняется, и вызов получает более новую.
  - Следующие страницы, категории и счета на диск не ложатся.
- **`MoneyText`** — «−25 000 сум», «+1 200,50 USD» по правилам `formatMinor`: U+2212, неразрывные пробелы, сумы
  округляются как `Math.round`, только целые числа.
- **`ServerError`** (`Kapelka/Queue/`) — один разбор вложенной и плоской ошибки для очереди и клиента записей; поведение
  очереди не изменилось.
- `AppServices.records` собран, экраны его пока не читают. `FakeTransport` умеет ответ с задержкой (`.after`).
  `ios/README.md` — строка в «Как устроено».

Проверка 2026-10-31:
- **Под-чат разработки.** `ios/scripts/test.sh`: 229 тестов в 27 сьютах прошли, 0 предупреждений (до задачи — 170 в
  20). Тесты писались первыми, падение видно до кода. Проверка мутацией: без повтора правок поверх страницы, пришедшей
  во время обновления, падают оба теста гонки; без номера обновления падает тест двух обновлений.
- **Под-чат проверки.** Проверка на настоящем сервере: порт 3147, шесть записей, три страницы по курсору, все поля
  совпали; все тела DELETE, restore и PUT и все 404, 400, 401 и 403 попали в верный случай. Гонка двух обновлений
  (первое ответило позже второго — на диске оставалась старая страница с более поздним временем) воспроизведена и
  закрыта: тест `olderRefreshAnsweringLastLoses`, первое отвечает через 300 мс страницей [a], второе сразу — [new, a],
  на диске [new, a].
- Замечания проверки исправлены: «USD» вместо «$», `accounts()`, номер у обновления, `LossyList` на обёртке, общий
  `ServerError`.

Известно (принятые риски):
- повтор правок поверх страницы может примерно на секунду вернуть запись, удалённую в Mini App в то же окно, — до
  следующего обновления;
- чужая запись по токену — 403 («проверь токен»), а не 404: так отвечает сервер (`AuthorizationError`). Владелец у токена
  один, на деле не встретится;
- категории не кэшируются: без связи их всё равно не поменять (решение 2026-10-31). Счета тоже: без связи строка FT-220
  показывает одну категорию, без имени счёта;
- записи до FT-100 хранят в `date` полный момент; модель держит строку как есть, по дню группирует FT-220;
- типы функций с typed throws требуют рантайм iOS 18, а цель — iOS 17: в тестах такие замыкания с обычным `throws`;
- против живого сервера с токеном (FT-218) клиент проверит FT-220.

---

### FT-048: Upgrade sqlite3 to v6

Status: done
Priority: low
Owner: Claude Code, QA — под-чат проверки
Type: tech-debt

Context:
После `npm audit fix` осталось 7 уязвимостей, все в цепочке `sqlite3@5.1.7` → `node-gyp` → `tar` (critical) + `cacache`. Закрывается только мажорным апгрейдом. После ревизии 2026-08-13 локальный SQLite — основной рабочий контур, поэтому major upgrade может сломать именно то, чем сейчас пользуемся.

Status note 2026-08-16: blocked until Shukur explicitly approves `npm audit fix --force` / major sqlite3 upgrade. Do not run force dependency upgrades autonomously.

**2026-10-31:** Шукур взял FT-048 в пачку мелочей. Мажорное обновление делается явной установкой `sqlite3@6`, а не
`npm audit fix --force`. Нативный модуль: на ПК `scripts/live-update.sh` (`npm ci`) должен собрать или скачать его под
Node 22 — проверить заранее в WSL-подобной среде или описать откат (`live-good`).

Definition of Done:
- [x] `sqlite3` v6 поставлен явной установкой, без `npm audit fix --force`
- [x] `npm run verify` зелёный
- [x] SQLite-путь проверен вручную: создание, чтение, обновление транзакции
- [x] `npm audit` не содержит critical

Реализовано 2026-10-31 (`4271249`, `9cf5c8a`, `b062971`; PR #150):
- **`sqlite3` 5.1.7 → 6.0.1** (`^6.0.1`) явной установкой `npm install sqlite3@^6.0.1`.
  - Обошлось без `--force`, `--legacy-peer-deps` и обновления typeorm: `typeorm` 0.3.31 допускает `sqlite3`
    `^5.0.3 || ^6.0.0`. В `src/` изменений нет.
  - Что меняет sqlite3 6: Node ≥ 20.17; `tar` 6 → 7; `node-gyp` 8 → 12, теперь необязательный — только для сборки из
    исходников; SQLite 3.44.2 → 3.52.0. JS API тот же.
  - Lock против `main` `ae048be`: 6 пакетов добавлено, 66 удалено, 26 изменено — все в цепочке sqlite3. `tar` 6.2.1 →
    7.5.22, `node-addon-api` 7.1.1 → 8.9.2, `minipass` 3.3.6 → 7.1.3, `minizlib` 2 → 3, `chownr` 2 → 3; необязательные
    `node-gyp` 8.4.1 → 12.4.0, `nopt`, `abbrev` и зависимости node-gyp 12 (`undici`, `proc-log`, `which`). Ушла вся
    цепочка node-gyp 8: `make-fetch-happen`, `cacache`, `npmlog`, `socks`, `http-proxy-agent`, `@tootallnate/once`.
- **Готовая сборка под Linux x64 требует glibc 2.38+.** Сборки 6.0.x собраны на ubuntu-24.04: `GLIBC_2.38` (`fmod`) и
  `GLIBCXX_3.4.31`; сборке 5.1.7 хватало `GLIBC_2.4`.
  - Ниже 2.38 `npm ci` проходит (prebuild-install glibc не проверяет), но модуль не грузится, а TypeORM пишет только
    `SQLite package has not been found installed`.
  - На ПК Ubuntu 24.04, glibc 2.39 (проверено 2026-10-31) — ничего не нужно. Для 22.04 — `build_from_source=sqlite3`
    в `~/.npmrc`, модуль собирается из исходников.
- **`scripts/live-update.sh`** после `npm ci` загружает `sqlite3` (`node -e "require('sqlite3')"`). Не грузится —
  обновление останавливается до перезапуска, старая версия работает, `live-good` не двигается. Сообщение
  `the native sqlite3 module does not load` отправляет в `troubleshooting.md`. Тестов у скрипта нет; проверено в
  Docker (ниже).
- **Документы:**
  - `live-instance.md`: шаг 4 — готовая сборка на 24.04 и новее, на 22.04 — сборка из исходников; в «Обновлении» —
    проверка `sqlite3` и заметка про переход на sqlite3 6 с откатом на `live-good`;
  - `troubleshooting.md`: строки `the native sqlite3 module does not load` и `SQLite package has not been found
    installed`;
  - `database-guide.md`: как увидеть настоящую причину `DriverPackageNotInstalledError`.
- **В backlog:** FT-233 — оценить замену `sqlite3` на `better-sqlite3` или `node:sqlite`.

Проверка 2026-10-31:
- **Под-чат разработки.**
  - `npm ci --include=dev` с нуля по новому lock: lock-файлы не изменились. `npm run verify`: Jest 120 наборов —
    2084 прошли, 1 пропущен; Vitest 127 файлов, 1277; шрифты, токены, dependency-cruiser (346 модулей) и madge чистые.
    После проверки `sqlite3` в `live-update.sh` — ещё прогон, те же числа.
  - `npm audit` в корне, `main` → ветка:
    - всё: 38 (critical 1, high 4, moderate 27, low 6) → 30 (0 / 0 / 26 / 4) — без critical и high;
    - `--omit=dev`: 12 (1 / 4 / 5 / 2) → 3 moderate — `typeorm` → `glob`, `minimatch` (FT-215).
  - Руками: API из ветки на порту 3048, свежая база, `X-Dev-User-Id`. Создание → 201, чтение, обновление суммы и
    описания, список, удаление (потом 404), возврат; в файле — новые значения. `lsof` — порт у своего процесса из
    worktree, с бинарником `sqlite3` 6.
  - Копия базы мака (`sqlite3 -readonly … ".backup …"`, исходник не менялся):
    - на старте приложение сделало бэкап и применило 3 ждущие миграции — с пересозданием `accounts` и
      `notifications_log`;
    - `GET /api/transactions` — 36 записей, столько же активных строк в файле;
    - `migration:show` — 22 из 22, схема совпадает с сущностями;
    - строки совпали во всех таблицах с данными, `integrity_check` — ok. Отличия ожидаемые: `migrations` 19 → 22, новая
      пустая `handled_messages`, `fx_rates` +1 (курс ЦБ на старте).
  - Docker `linux/amd64`, Node 22.23.4:
    - ubuntu:24.04 (glibc 2.39) — готовая сборка грузится, TypeORM пишет и читает;
    - node:22-bookworm (2.36) и ubuntu:22.04 (2.35) — `npm ci` проходит, `require` падает на `GLIBC_2.38' not found`;
    - на 22.04 `npm rebuild sqlite3 --build-from-source` и `build_from_source=sqlite3` в `~/.npmrc` чинят — около 90 с
      под эмуляцией;
    - `live-update.sh` на копии ветки (перезапуск подменён, health пропущен): ubuntu:22.04 — после `npm ci` отказ
      `the native sqlite3 module does not load`, код 1, до сборки сервера и перезапуска; ubuntu:24.04 — проверка
      проходит, сервер собран, перезапуск вызван, код 0.
  - Откат: базу, записанную приложением на v6 (22 миграции), открывает `sqlite3` 5.1.7 (SQLite 3.44.2) из lock `main`:
    `integrity_check` — ok, чтение и запись проходят.
- **Под-чат проверки**: «можно мержить», блокеров нет. Повторил Docker ubuntu:24.04 и 22.04 и откат на v5. Замечания
  исправлены: проверка `sqlite3` в `live-update.sh`, факт про ПК в `live-instance.md`, «ниже 24.04 (glibc < 2.38)»
  вместо «старше», пункт про Ubuntu в шаге 4.

Известно (принятые риски):
- `TryGhost/node-sqlite3` помечен unmaintained (README, PR #1844, 2026-03-12); 6.0.1 — последний релиз, новые
  исправления SQLite через него не придут — FT-233;
- Dockerfile (`node:20-alpine`, отложен вместе с production) не проверялся;
- `undici` 6.29.1 пришёл с `node-gyp` 12 — необязательная зависимость, нужна только для сборки из исходников;
- в рабочих зависимостях остались 3 moderate — `typeorm` → `glob`, `minimatch`, FT-215.

---

### FT-218: The app token reads and edits its owner's records

Status: done
Priority: high
Owner: Claude Code, QA — под-чат проверки
Type: feature
Size: S
Depends on: FT-174 (обе правят `auth-user-resolution-boundary-matrix.md`, FT-174 — ещё и `transactionController.ts`)

Context:
Решение Шукура 2026-10-31 (`docs/tasks/decisions.md`): iOS-приложение показывает записи с сервера, удаляет их и меняет
категорию (FT-219…FT-221). Сейчас токен приложения `SHORTCUT_CAPTURE_TOKEN` пускает только на запись:
`allowShortcutCapture` (`authMiddleware.ts:571`) стоит на двух маршрутах, `quickCaptureController.ts:31,90`. Нужны ещё
шесть, все для `SHORTCUT_CAPTURE_OWNER`:
- `GET /api/transactions` — история FT-107 с курсором (`transactionController.ts:257`, `createCurrentUserMiddleware`);
- `GET /api/categories` (`expressServer.ts:172`);
- `GET /api/accounts` — только список, имя счёта для строки «категория · счёт» в FT-220 (`expressServer.ts:175`,
  решение 2026-10-31 после FT-219); остальные маршруты `/api/accounts` токену закрыты;
- `DELETE /api/transactions/:id` (`transactionController.ts:335`, `optionalAuth` и проверка владельца);
- `POST /api/transactions/:id/restore` (`:369`);
- `PUT /api/transactions/:id` (`:392`); iOS шлёт только `{ categoryId }`, поля не ограничиваем (решение).

Токен — ещё один способ узнать текущего пользователя, рядом с initData и cookie, и только на этих маршрутах, по явному
списку. Контракты маршрутов не меняются: iOS читает те же ответы, что Mini App (`docs/pastel/api.md`).

Definition of Done:
- [x] С верным токеном шесть маршрутов работают для владельца так же, как с его initData: история с курсором, категории,
      список счетов, удалить, вернуть, `PUT { categoryId }`; тесты
- [x] На любом другом маршруте токен не пускает — ответ как без входа; тест хотя бы на `POST /api/transactions`,
      `PATCH /api/categories/:id`, `POST /api/accounts`, `GET /api/accounts/:id/operations`, `GET /api/export`
- [x] Чужая запись по токену — тот же ответ, что Mini App даёт на чужую запись; тест
- [x] Неверный токен — `401 INVALID_SHORTCUT_TOKEN`; путь не настроен — `403 SHORTCUT_CAPTURE_DISABLED`; правила вне
      production — как у записи (FT-155); тесты
- [x] `PUT { categoryId }` по токену учит так же, как из Mini App (FT-184); тест
- [x] Mini App и бот не затронуты: initData и cookie работают как раньше, весь `npm run verify` зелёный
- [x] Токена нет в логах; лимиты запросов не меняются (политика — FT-071)
- [x] Документация: что даёт токен — `docs/QUICK_CAPTURE_API.md` и `docs/pastel/api.md`;
      `auth-user-resolution-boundary-matrix.md`, `api-route-coverage-matrix.md`; строка `SHORTCUT_CAPTURE_TOKEN` в `CLAUDE.md`
- [ ] Шукуру после мержа: `scripts/live-update.sh` на ПК. Если токен лежит в быстрой команде FT-075 открытым текстом —
      выпустить новый (`live-instance.md`, раздел 5) и вставить его в приложение — за Шукуром

Реализовано 2026-10-31 (`ccb4341`, `b3e1e9d`, `f85f6f5`, `3f8fb63`, `fcf1ad5`; PR #151):
- **`authMiddleware.ts`.** Правила токена — в общей `shortcutOwnerOrRefuse(req, res, use)`, одной для записи и шести
  маршрутов записей. `requireAuthOrAppToken` и `optionalAuthOrAppToken` (`signInWithAppTokenOr`) ставят владельца в
  `req.telegramUser`; дальше запрос идёт как с initData владельца: разрешение пользователя, `verifyResourceOwnership`,
  обработчик. Запись (`allowShortcutCapture`) `req.telegramUser` по-прежнему не ставит.
- **Решает только токен.** С `X-Shortcut-Capture-Token` (даже пустым) или непустым `X-Shortcut-User-Id` initData, cookie
  и `X-Dev-User-Id` рядом не считаются; неверный токен — `401` и рядом с верным initData. Без этих заголовков вход как
  раньше.
- **Маршруты.** История, удаление, возврат и `PUT` — смена middleware (`createCurrentUserOrAppTokenMiddleware`,
  `optionalAuthOrAppToken`). В `/api/categories` и `/api/accounts` `GET /` стоит до `router.use(createCurrentUserMiddleware)`,
  остальные маршруты идут через этот `use` — новый маршрут там закрыт для токена по умолчанию.
- **После проверки безопасности.** Вне production без `SHORTCUT_CAPTURE_OWNER` маршруты записей принимают
  `X-Shortcut-User-Id` только с этой машины, как `X-Dev-User-Id`; через туннель — `403 SHORTCUT_OWNER_REQUIRED` после
  проверки токена. Запись через туннель — по-прежнему по FT-075. Ошибка старта (`shortcutCaptureAccess.ts`) и текст
  `ACCESS_DENIED` больше не говорят, что токен только пишет.
- **Лог.** В отказах и debug-строке — шаблон маршрута (`/api/transactions/:id`), токена нет.
- **Документация.** `QUICK_CAPTURE_API.md` — раздел «The app token on the records routes (FT-218)»; `pastel/api.md` —
  общие правила, и исправлено: возврат чужой записи — `403`, не `404`; обе матрицы; строка в `CLAUDE.md`;
  `IOS_SHORTCUT_ACTION_BUTTON.md` и `live-instance.md` (раздел 5) — что токен теперь и читает; вводные в FT-071.
- **Тесты.** `tests/appTokenRecords.test.ts` (26), случаи FT-218 в `tests/localDevAuth.test.ts` (14),
  `tests/helpers/telegramInitData.ts`.

Проверка 2026-10-31:
- **verify.** `npm run verify` на `3f8fb63`: Jest 121 сьют / 2124 теста (+1 пропущен), webapp 127 файлов / 1277 тестов,
  сборки, `check:fonts`, `check:tokens`, dependency-cruiser и madge — чисто. До проверки безопасности — 121 / 2121.
  Тесты писались первыми, падение видно до кода.
- **Живой production-сервер.** Своя копия на `127.0.0.1:3218` (процесс проверен через `lsof`), временная база,
  `ENABLE_TELEGRAM_POLLING=false`, выдуманные токен и владелец в `.env.local` копии — после проверки удалены. Шесть
  маршрутов — `200`: история по курсору 2 + 1, 16 категорий, «Карта», удалить, вернуть, `PUT` → «Продукты». Закрытые
  маршруты (`POST /transactions`, `PATCH /categories/:id`, `POST /accounts`, `/accounts/:id/operations`, `/export`,
  `/settings`, `GET /transactions/:id`) с токеном и без — одинаковые `401` / `403`; неверный токен — `401`, чужой
  `X-Shortcut-User-Id` — `403 ACCESS_DENIED`, чужая запись — `403 AUTHORIZATION_ERROR`.
- **Все маршруты.** Тест обходит все маршруты `buildServer` с одним токеном и без: отличаются ровно 2 маршрута записи и
  6 маршрутов записей. Мутацией (токен на `/:id/archive`) тест падает.
- **Проверка безопасности (под-чат проверки): «можно мержить», блокеров и серьёзного нет.** Обходы — регистр, слэши,
  %-кодирование, method override, `/:id`-маршруты, operations, opening-balances и др. — отвечают как без входа. Подмена
  пользователя не проходит, фантомных пользователей нет. `SHORTCUT_CAPTURE_DISABLED` и ошибка старта на месте; токен
  сравнивается `safeTokenEquals`. Логи на debug — 0 кусков токена. Обучение: `uses` 1 → 2 (токен, затем Mini App), третья
  фраза — без ИИ. Лимит: 100 запросов, 101-й — `429`. Находка «вне production токен без владельца через туннель читает
  чужие записи» исправлена в `3f8fb63`.

Известно (принятые риски):
- утёкший токен читает все записи владельца, удаляет и правит их (цена решения 2026-10-31): сервер только в tailnet,
  iOS держит токен в Keychain; токен из быстрой команды FT-075 заменить новым;
- iOS (`RecordsClient.swift:110`) переводит любой `403` в «проверь токен», в том числе `403` на чужую запись. Для одного
  владельца это допустимо; если понадобится различать — у такого ответа код `AUTHORIZATION_ERROR`;
- лимит: токен считается по адресу в общем счётчике 100 / 15 минут вместе с запросами без входа и с попытками угадать
  токен (`401`). За `tailscale serve` весь tailnet может попасть в один счётчик: IPv6 /56 или `127.0.0.1` без
  `X-Forwarded-For`. Обновление iOS — 1–3 запроса, около 30 обновлений за 15 минут; `429` iOS покажет как «Нет связи».
  Вводные — в FT-071;
- `requestLogger` пишет `req.url`: токен в query попал бы в лог, но клиент шлёт токен только заголовком;
- `PUT` по токену правит любые поля, не только `categoryId` (решение);
- обход маршрутов в тесте читает внутренности Express 4 (`router.stack`, `layer.regexp`): непонятный путь — явная
  ошибка теста; при переходе на Express 5 разбор обновить.

---

### FT-220: iOS tabs «Записать» and «Записи»: the server list by day

Status: done
Priority: high
Owner: Claude Code, Shukur (iPhone), QA — под-чат проверки
Type: feature
Size: M
Depends on: FT-218, FT-219

Context:
Решение Шукура 2026-10-31 (`docs/tasks/decisions.md`). Сейчас один экран (`ios/Kapelka/UI/MainView.swift`): микрофон, поле,
строка очереди и «Последние» — локальная очередь с ответом сервера на момент отправки. Запись, удалённая в Mini App или
боте, там остаётся. Становится так, всё на стандартных компонентах SwiftUI:
- **`TabView`**: «Записать» и «Записи». «Записать трату» с Action Button (`ListenRequest`) всегда открывает «Записать» и
  слушает, на какой бы вкладке ни было приложение.
- **«Записать»** — микрофон, поле, итог последней фразы. Из очереди — только то, что требует внимания: ждёт,
  отправляется, ошибка, «не нашёл операцию» (`CaptureRow.Kind`). «Не нашёл операцию» на сервере записи не создаёт,
  поэтому остаётся здесь. Записанное уходит во вкладку «Записи».
- **«Записи»** — `List` с секциями по дням («Сегодня», «Вчера», «29 октября»). В строке: магазин или заметка,
  «категория · счёт» (имя счёта — по `accountId` из `GET /api/accounts`, FT-218; клиент FT-219 его уже читает),
  сумма со знаком (доход зелёный с «+»), значок у записей «проверить». Следующая страница подгружается при прокрутке.
- **Когда обновляется**: при открытии вкладки, при возврате в приложение (`scenePhase`), потягиванием (`.refreshable`) и
  после того, как очередь что-то отправила. Постоянного опроса нет.
- **Пусто** — `ContentUnavailableView` «Записей пока нет». **Нет адреса или токена** — то же с кнопкой «Настройки».
  **Без связи** — список из кэша и подпись «Нет связи · обновлено в 14:32».

Definition of Done:
- [x] Две вкладки; Action Button открывает «Записать» и слушает с любой вкладки
- [x] «Записать» показывает из очереди только ждущие, отправляемые, ошибки и «не нашёл операцию»; тест на `CaptureRow`
- [x] «Записи» — список с сервера по дням, следующая страница — при прокрутке
- [x] В строке имя счёта по `accountId` из `GET /api/accounts` (запрос добавлен в клиент FT-219); счёт, которого
      нет в списке, — без имени, строка не пропадает; тест
- [x] Обновление — во всех четырёх случаях из Context. Запись, удалённая через API, пропадает после обновления. Проверка:
      симулятор против `api` (порт 3100) с `SHORTCUT_CAPTURE_TOKEN` и `SHORTCUT_CAPTURE_OWNER` в `.env.local` копии
- [x] Без связи — кэш и «Нет связи · обновлено в …»; без настроек — экран с кнопкой «Настройки»
- [x] Только стандартные компоненты; скриншоты симулятора обеих вкладок, светлая и тёмная тема
- [x] `ios/README.md` — раздел «Записи»; `ios/scripts/test.sh` зелёный
- [ ] Шукуру — на iPhone: удалить запись в Mini App → в приложении потянуть вниз → её нет — за Шукуром

Реализовано 2026-10-31 (`fe4a1d8`, `b38d4f2`, `87d6259`, `ecc001e`, `d486730`; после проверки — `d4996af`, `01b8005`,
`7f2f5df`, `9523160`, `80bec21`; PR #157):
- **Вкладки** (`RootView`, `AppNavigation`). `TabView` через `.tabItem` / `.tag` (цель — iOS 17), одна шторка настроек
  над обеими вкладками. `AppNavigation.takeListenRequest` переключает на «Записать» и запускает микрофон только в
  активной сцене и без открытых настроек.
- **«Записать»** (`CaptureView`, бывший `MainView`). Секция «Требует внимания» — `CaptureRow.needingAttention`: ждёт,
  отправляется, ошибка, «не нашёл операцию». Ошибку и «не нашёл операцию» убирает свайп «Убрать»
  (`CaptureQueue.dismiss`): на сервере их нет. Ждущая по-прежнему удаляется «Удалить».
- **«Записи»** (`RecordsView`, модель `RecordsList`):
  - секции по дням — `RecordDays`: «Сегодня», «Вчера», «27 октября», другой год — с годом. Записи до FT-100 с полным
    моментом в `date` — в своём дне по календарю телефона. День на стыке страниц — одна секция;
  - строка: заметка, иначе магазин, иначе категория; под ней «категория · счёт» (имя по `accountId`, счёта нет —
    без имени); сумма `MoneyText.signed`, доход зелёный; оранжевый «!» у «проверить». Заголовок и подпись — до двух
    строк, на размерах для доступности сумма под заголовком (`RecordRowLayout`);
  - страница и счета — одновременно; счета не пришли — остаются прошлые имена. Следующая страница — строка в конце
    списка, её `id` — `nextPageKey` (поколение и курсор). Обновление начинает с первой страницы, запоздавшая
    следующая страница отбрасывается;
  - пустые состояния — `ContentUnavailableView`: «Записей пока нет», «Нет адреса и токена» и «Сервер не принял токен»
    с «Настройки», «Нет связи» с «Повторить»; без связи над кэшем — `RecordsCaption`.
- **Когда обновляется**: открыли вкладку; вернулись в приложение из фона с открытыми «Записями» (`.inactive` —
  шторка, Пункт управления, переключатель — не возврат); потянули вниз; очередь записала запись
  (`QueueStatus.wroteRecords`) при открытых «Записях»; закрылись настройки. Вызовы во время обновления ждут его и
  ещё один проход после — в пути одна страница.
- **Тесты**: `RecordDaysTests`, `RecordsListTests`, `RecordsCaptionTests`, `AppNavigationTests`, `CaptureDismissTests`,
  новые случаи в `CaptureListTests`; `RoutedTransport` отвечает по маршруту.
- `ios/README.md` — раздел «Записи», правки там, где список был один.

Проверка 2026-10-31:
- **Тесты.** `ios/scripts/test.sh`: 268 тестов в 32 сьютах, 0 предупреждений (до задачи — 229 в 27). Тесты писались
  первыми. Мутациями падают свои тесты: без смены вкладки, без отбрасывания запоздавшей страницы, без ожидания
  обновления (`maxInFlight`), с записанными строками на «Записать».
- **Под-чат разработки, симулятор против `api`.** Копия на `localhost:3100`, development, временная база, выдуманные
  токен и владелец в `.env.local` — после проверки удалены, приложение снято, Keychain симулятора сброшен.
  - 67 записей: вторая страница догрузилась прокруткой.
  - `DELETE` токеном, потянул вниз — запись исчезла.
  - Записал очередью при возврате в приложение: в логе `POST /quick-capture`, затем два `GET /transactions`.
  - «Записать трату» из «Быстрых команд» с «Записей» открыла «Записать» и запустила микрофон.
  - «Нет адреса и токена» → «Настройки» → «Сохранить» — список загрузился.
- **Под-чат проверки, свой живой сервер, 91 запись, прокси с задержками.** Все пункты DoD подтверждены в симуляторе.
  - Четыре случая обновления; удалённая через API запись пропадает.
  - День на стыке страниц — одна секция; момент `2026-10-28T20:30Z` — в «29 октября».
  - Токена в логах — 0.
- **Правки после проверки.**
  - Серьёзные: на размерах для доступности строка была нечитаема («С…»), на xxxL обрезалось имя счёта — теперь сумма
    под заголовком, две строки; список обновлялся на каждом `.inactive → .active` и терял прокрутку — теперь только
    после фона. Скриншоты xxxL и AX-XL — у штаба. Шторка уведомлений вживую — 0 новых `GET`, возврат из фона — 1.
  - Мелочи: подгрузка вставала, если обновление приносило ту же первую страницу, пока следующая была в пути
    (`nextPageKey`); «Убрать» для ошибки и «не нашёл операцию»; формулировка «как в Mini App» исправлена — общий с
    Mini App только порядок «заметка, иначе магазин».

Известно (принятые риски):
- «Записать трату» с вкладки «Записи» даёт одно лишнее обновление: сцена активна раньше, чем выставлена просьба
  слушать;
- без связи после перезапуска строки идут без имени счёта — счета не кэшируются (FT-219);
- 429 показывается как «Нет связи»; `.refused` без кэша — тоже экран «Нет связи»;
- уход с вкладки не отменяет запросы в пути;
- обновление начинает с первой страницы: прокрученные страницы уходят (без связи — остаются);
- счета запрашиваются на каждое обновление — 2 запроса; счётчик 100 / 15 минут (FT-218) это выдерживает;
- «Убрать» проверен и вживую повторной проверкой: «не нашёл операцию» (сервер с OpenAI) и «ошибка» (400 от прокси)
  убираются свайпом и не возвращаются после перезапуска; у ждущей строки «Убрать» нет.
