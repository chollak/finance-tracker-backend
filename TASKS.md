# Finance Tracker — Task Board

Активная доска. Здесь только живая работа: задача в работе, очередь за ней и список отложенного.
Закрытые задачи сюда не возвращаются.

| Что нужно | Где смотреть |
|---|---|
| Как устроена доска, статусы, роли | [`docs/tasks/README.md`](docs/tasks/README.md) |
| Почему план такой — лог решений | [`docs/tasks/decisions.md`](docs/tasks/decisions.md) |
| Отложенные задачи, полные описания (23) | [`docs/tasks/backlog.md`](docs/tasks/backlog.md) |
| Открытые задачи вехи 10 | [`docs/pastel/tasks.md`](docs/pastel/tasks.md) |
| Закрытые задачи с отчётами (160) | [`docs/tasks/archive/`](docs/tasks/archive/) |

---

## Текущий фокус — живой экземпляр на ПК

Живой экземпляр переезжает с мака на ПК с Windows + WSL: systemd, постоянный адрес `tailscale serve` в tailnet,
ночной бэкап в облачную папку, закрытый доступ (решение 2026-10-26, `docs/tasks/decisions.md`). Порядок:

1. Код: FT-153 → FT-154 → FT-155 по одной — трогают одни и те же файлы. FT-158 — сделана.
2. Скрипты и инструкции: FT-156 (живой экземпляр), FT-157 (бэкап). Запускает Шукур на ПК.
3. Переезд FT-159 — руки Шукура; потом Shortcut FT-160 и iOS-приложение FT-161.

Прогресс: FT-153 в работе · FT-154 · FT-155 · FT-156 · FT-157 → FT-159

### Веха 10 «Пастель» — в `main`

Дизайн «Пастель» перенесён в код и слит в `main` PR #90 (2026-10-26): фазы 0–8 и FT-137…FT-143. Закрытые задачи
вехи с отчётами — [`archive/ft-087-143-pastel.md`](docs/tasks/archive/ft-087-143-pastel.md). Открыты задачи, которым
нужны телефон, настоящие чеки или решение Шукура; описания — [`docs/pastel/tasks.md`](docs/pastel/tasks.md):

| Задача | Суть | Чего ждёт |
|---|---|---|
| FT-088 | Спайк: голос в Mini App на iOS, Android, Desktop | проверка на телефонах (`/dev/voice-check`, `docs/pastel/voice-check.md`) |
| FT-089 | Спайк: QR и фото фискального чека | 10 настоящих чеков и ключ модели с vision |
| FT-108 | Исправить тип старых записей (backfill по превью FT-045) | «да» Шукура по списку: меняются 2 записи из 21 (`docs/pastel/handoff.md`) |
| FT-117 | Голос в Mini App | вывод FT-088 |
| FT-134, FT-135 | Чек: распознавание, экраны и фото в боте | вывод FT-089 |
| FT-136 | Уборка переходного кода | после FT-117, FT-134, FT-135; вместе с FT-162 |

### Постоянный контекст

- Прод и AWS выключены намеренно и в планы не входят (решение 2026-08-13). Рантайм — локальный + SQLite + Telegram polling.
- Живой экземпляр до переезда — `npm run dev:miniapp` на маке (Cloudflare quick tunnel), после — ПК с WSL и `tailscale serve` (FT-156, FT-159).
- Работа идёт по схеме «штаб и под-чаты»: роли, цикл задачи и как проверяем — [`docs/tasks/README.md`](docs/tasks/README.md).
- Supabase-проект на паузе, не удалён. Путь `supabase-js` убран из сборки (Д6, FT-090); только `DATABASE_TYPE=sqlite`.
- Лимиты free выключены на время вехи 10 (Д3, `FREE_LIMITS_ENABLED`).
- Все исторические транзакции имеют `semanticType = expense`. Backfill по превью FT-045 применяется в FT-108 — только после того, как Шукур просмотрит список.

---

## В работе

### FT-153: Closed access by ALLOWED_TELEGRAM_IDS

Status: in_progress
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
- [ ] `ALLOWED_TELEGRAM_IDS` (Telegram id через запятую) в `AppConfig`; при `NODE_ENV=production` пустой список — ошибка старта (fail-closed), вне production пустой список пускает всех, как сейчас
- [ ] Бот: сообщение или нажатие не-допущенного не создаёт пользователя, не вызывает OpenAI и не пишет в базу; бот молчит, в логе `warn` с Telegram id, чтобы было видно, кого отсекли; тест
- [ ] API: initData или cookie входа не-допущенного — 403 до `resolveUser`, строка в `users` не появляется; тест
- [ ] Вход в браузере через бота (FT-128) не-допущенному не выдаётся; тест
- [ ] Итоги дня и напоминания уходят только допущенным; тест
- [ ] Переменная описана в `.env.example`, `CLAUDE.md` и `docs/knowledge-base/08-development/quick-start.md`

---

## Очередь

Переезд на ПК. Порядок задаёт `Depends`; задачу можно брать, когда закрыто всё, от чего она зависит.

### FT-154: The bot does not die silently

Status: backlog
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
- [ ] При `NODE_ENV=production` окончательный сбой polling (`state = failed`) останавливает планировщики, закрывает базу и завершает процесс с ненулевым кодом; тест
- [ ] `/api/health` отвечает 503, когда бот в состоянии `failed`; `starting` и `retrying` (409, пока мак ещё опрашивает тот же токен) — 200; тест
- [ ] Вне production поведение прежнее: разработка без бота работает
- [ ] Правило описано в `docs/knowledge-base/01-architecture/runtime-process-mode.md`

---

### FT-155: Owner-bound capture token for the iPhone in production

Status: backlog
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
- [ ] Новая `SHORTCUT_CAPTURE_OWNER` (Telegram id) — владелец записей по токену; `X-Shortcut-User-Id` необязателен, а если есть и не равен владельцу — 403; тест
- [ ] В production путь работает, только если заданы токен не короче 32 символов и владелец, и владелец входит в `ALLOWED_TELEGRAM_IDS` (FT-153); иначе 403, как сейчас; тест
- [ ] Неверный или пустой токен — 401 `INVALID_SHORTCUT_TOKEN`, сравнение по-прежнему за постоянное время; тест
- [ ] Повтор с тем же `clientId` не создаёт дублей; тест
- [ ] Заголовки разработчика (`X-Dev-User-Id`) в production по-прежнему не действуют; тест
- [ ] Описан отзыв токена: новое значение в `.env.local` и перезапуск сервиса
- [ ] Обновлены `docs/QUICK_CAPTURE_API.md`, `docs/IOS_SHORTCUT_ACTION_BUTTON.md`, `.env.example` и `docs/knowledge-base/01-architecture/auth-user-resolution-boundary-matrix.md`; пометка «только dev/test» снята

---

### FT-156: Live instance on the Windows PC (WSL)

Status: backlog
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
- [ ] Отдельная копия `~/daftar-live` на `main` со своей `data/` и `.env.local` (`NODE_ENV=production`, `TZ=Asia/Tashkent` — старый код бюджетов, дашборда и лимитов берёт часы машины); разработка идёт в другой папке или на маке
- [ ] Шаблон unit-файла systemd в репозитории: `node dist/index.js`, `Restart=always`, логи в journald; в WSL включён `systemd=true`
- [ ] Задача Планировщика Windows при старте системы держит WSL запущенным; инструкция с командами
- [ ] Сон Windows при питании от сети выключен; Tailscale на Windows работает как служба и без входа пользователя
- [ ] `tailscale serve --bg` отдаёт `http://localhost:3000` как `https://<пк>.<tailnet>.ts.net`; этот адрес — в `WEB_APP_URL`; кнопка меню ставится один раз (`npm run miniapp:menu -- set`)
- [ ] Одна команда обновления (скрипт или npm-скрипт): `git pull --ff-only` ветки `main`, `npm ci`, сборки webapp и backend, перезапуск сервиса; описан откат — прошлый коммит и копия из `data/backups/`
- [ ] Проверено: Windows перезагружена без входа в WSL → бот отвечает, Mini App открывается с iPhone по адресу tailnet
- [ ] Новый документ `docs/knowledge-base/08-development/live-instance.md`; `CLAUDE.md` (Runtime target), `quick-start.md` и «Постоянный контекст» в `TASKS.md` описывают живой экземпляр вместо quick tunnel

---

### FT-157: Nightly database backup to a cloud folder

Status: backlog
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
- [ ] Скрипт снимает копию через `sqlite3 … ".backup …"` (онлайн-бэкап, безопасен при работающем приложении), проверяет её `PRAGMA integrity_check` и кладёт в `BACKUP_DIR` (облачная папка Windows через `/mnt/c/…`) с датой в имени; хранит последние 30
- [ ] Вместе с базой копируются `data/patterns.json` и `data/learning-data.json`
- [ ] systemd timer раз в сутки с `Persistent=true`: пропуск, пока ПК был выключен, догоняется после включения
- [ ] Ошибка копии видна в journald; пустой или недоступный `BACKUP_DIR` — ошибка, а не тихий пропуск
- [ ] Восстановление описано и проверено один раз: остановить сервис → файл из облачной папки на место `data/database.sqlite` → запуск → записи на месте
- [ ] В документе FT-156 записано: живую базу в облачную папку не класть — синхронизация портит SQLite
- [x] Какой облачный диск — Google Drive (ответ Шукура 2026-10-27): `BACKUP_DIR` — папка Google Drive для компьютера в Windows через `/mnt/…`

---

## Backlog — не начинать без явного запроса

Полные описания: [`docs/tasks/backlog.md`](docs/tasks/backlog.md).

| Задача | Суть | Чего ждёт |
|---|---|---|
| [FT-046](docs/tasks/backlog.md) | Применить Supabase-миграции 007 и 008 | живой Supabase; проект на паузе |
| [FT-048](docs/tasks/backlog.md) | Апгрейд sqlite3 до v6 | breaking-change апгрейд, отдельное решение |
| [FT-049](docs/tasks/backlog.md) | Свести доску с GitHub Issues | разрешение на внешние действия в GitHub |
| [FT-050](docs/tasks/backlog.md) | Разобрать мёртвые ветки | решение 2026-09-05: не удалять; инвентарь снят |
| [FT-051](docs/tasks/backlog.md) | Система внимания P1 и скорость ввода | продуктовое решение Шукура |
| [FT-054](docs/tasks/backlog.md) | Semantic type в ручной форме транзакции | продуктовое решение Шукура |
| [FT-063](docs/tasks/backlog.md) | Сроки долгов и напоминания | продуктовое решение Шукура |
| [FT-069](docs/tasks/backlog.md) | Граница premium некогерентна и обходится | политика монетизации |
| [FT-071](docs/tasks/backlog.md) | Rate limits тесноваты под реальное использование | политика лимитов |
| [FT-144](docs/tasks/backlog.md) | Итог дня и напоминания теряются после сбоя сети (сон мака) | слита в PR #91; идёт проверка |
| [FT-145](docs/tasks/backlog.md) | Таймаут и повторы для OpenAI: сейчас до 30 минут ожидания | слита в PR #91; идёт проверка |
| [FT-146](docs/tasks/backlog.md) | Индикатор, пока разбирается фраза | вид по холсту |
| [FT-147](docs/tasks/backlog.md) | Заметку в ручном вводе сжимает клавиатура | вид по холсту |
| [FT-148](docs/tasks/backlog.md) | Отметка записей до даты открытия счёта | вид по холсту |
| [FT-149](docs/tasks/backlog.md) | Выбор счёта по умолчанию | место на холсте или решение Шукура |
| [FT-150](docs/tasks/backlog.md) | Голые «яндекс» и «uber» не должны давать «Транспорт» | команды Шукура взять в работу |
| [FT-151](docs/tasks/backlog.md) | Нестабильный `webLogin.test.ts` | команды Шукура взять в работу |
| [FT-152](docs/tasks/backlog.md) | Без сети класть сложную фразу в очередь и разбирать на сервере | детали — с Шукуром |
| [FT-159](docs/tasks/backlog.md) | Переезд с мака на ПК | FT-153…FT-157; руки Шукура |
| [FT-160](docs/tasks/backlog.md) | Shortcut на Action Button через Tailscale | FT-155, FT-159 |
| [FT-161](docs/tasks/backlog.md) | Минимальное iOS-приложение для быстрой записи | ответы Шукура на открытые вопросы; FT-160 |
| [FT-162](docs/tasks/backlog.md) | Старые маршруты с `:userId` — пользователь из авторизации | вместе с FT-136 |
| [FT-163](docs/tasks/backlog.md) | Записи до первого запуска входят в остаток дважды | команды Шукура взять в работу |

---

## Что уже закрыто

160 задач: вехи 0–10 и весь отрезок до того, как появились вехи. Полные отчёты «Реализовано / Проверка» — в архиве.

| Отрезок | Задачи | Файл |
|---|---|---|
| Фундамент: стабилизация, аудиты, архитектура | FT-000…FT-024 | [`ft-000-024-foundation.md`](docs/tasks/archive/ft-000-024-foundation.md) |
| Продукт и UI: дизайн-система, вёрстка, ввод | FT-025…FT-041 | [`ft-025-041-product-ui.md`](docs/tasks/archive/ft-025-041-product-ui.md) |
| Семантические транзакции | FT-SEM-001…006 | [`ft-sem-semantic-transactions.md`](docs/tasks/archive/ft-sem-semantic-transactions.md) |
| Relaunch: локальный контур и доверие к цифрам | FT-042…FT-072 | [`ft-042-072-relaunch.md`](docs/tasks/archive/ft-042-072-relaunch.md) |
| Quick capture и первые срезы редизайна | FT-073…FT-081 | [`ft-073-081-quick-action.md`](docs/tasks/archive/ft-073-081-quick-action.md) |
| Веха 9, отменённый остаток (заменён «Пастелью») | FT-082…FT-086 | [`ft-082-086-quick-action-cancelled.md`](docs/tasks/archive/ft-082-086-quick-action-cancelled.md) |
| Веха 10: дизайн «Пастель» | FT-087…FT-143 (открытые — в `docs/pastel/tasks.md`) | [`ft-087-143-pastel.md`](docs/tasks/archive/ft-087-143-pastel.md) |
| Ежедневное пользование и переезд на ПК | с FT-144 | [`ft-144-daily-use.md`](docs/tasks/archive/ft-144-daily-use.md) |
