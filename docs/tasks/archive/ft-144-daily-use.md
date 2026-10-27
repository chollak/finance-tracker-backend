# Архив задач — ежедневное пользование и переезд на ПК

Задачи с FT-144: надёжность, закрытый доступ, переезд живого экземпляра на ПК.

Закрыто задач: **2**. Это архив: задачи здесь не переоткрываются и не редактируются.
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
