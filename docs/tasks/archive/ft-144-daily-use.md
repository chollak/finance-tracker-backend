# Архив задач — ежедневное пользование и переезд на ПК

Задачи с FT-144: надёжность, закрытый доступ, переезд живого экземпляра на ПК.

Закрыто задач: **5**. Это архив: задачи здесь не переоткрываются и не редактируются.
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
