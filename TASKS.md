# Finance Tracker — Task Board

Активная доска. Здесь только живая работа: задача в работе, очередь за ней и список отложенного.
Закрытые задачи сюда не возвращаются.

| Что нужно | Где смотреть |
|---|---|
| Как устроена доска, статусы, роли | [`docs/tasks/README.md`](docs/tasks/README.md) |
| Почему план такой — лог решений | [`docs/tasks/decisions.md`](docs/tasks/decisions.md) |
| Отложенные задачи, полные описания (26) | [`docs/tasks/backlog.md`](docs/tasks/backlog.md) |
| Открытые задачи вехи 10 | [`docs/pastel/tasks.md`](docs/pastel/tasks.md) |
| Закрытые задачи с отчётами (167) | [`docs/tasks/archive/`](docs/tasks/archive/) |

---

## Текущий фокус — живой экземпляр на ПК

Живой экземпляр переезжает с мака на ПК с Windows + WSL: systemd, постоянный адрес `tailscale serve` в tailnet,
ночной бэкап в облачную папку, закрытый доступ (решение 2026-10-26, `docs/tasks/decisions.md`). Порядок:

1. Код: FT-153 → FT-154 → FT-155 по одной — трогают одни и те же файлы. Все три сделаны — код переезда готов; FT-158
   тоже сделана.
2. Скрипты и инструкции: FT-156 (живой экземпляр) и FT-157 (ночной бэкап) сделаны; запуск на ПК — Шукур. Очередь
   переезда по коду и скриптам пройдена.
3. Перед установкой на ПК — переименование в Kapelka (FT-168, решение 2026-10-28). Затем переезд FT-159 руками Шукура;
   потом Shortcut FT-160 и iOS-приложение FT-161.

Прогресс: FT-153 сделана · FT-154 сделана · FT-155 сделана · FT-156 сделана · FT-157 сделана → FT-168 в работе → FT-159 (руки Шукура)

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
- Живой экземпляр — systemd-сервис на ПК с WSL (`~/kapelka-live` на `main`, свой бот Kapelka), постоянный адрес в tailnet через `tailscale serve`, обновление `scripts/live-update.sh`, ночной бэкап в `C:\KapelkaBackup` с выгрузкой в Google Drive (FT-157): [`live-instance.md`](docs/knowledge-base/08-development/live-instance.md) (FT-156). До переезда FT-159 он ещё на маке в `npm run dev:miniapp`; `dev:miniapp` остаётся для разработки.
- Работа идёт по схеме «штаб и под-чаты»: роли, цикл задачи и как проверяем — [`docs/tasks/README.md`](docs/tasks/README.md).
- Supabase-проект на паузе, не удалён. Путь `supabase-js` убран из сборки (Д6, FT-090); только `DATABASE_TYPE=sqlite`.
- Лимиты free выключены на время вехи 10 (Д3, `FREE_LIMITS_ENABLED`).
- Все исторические транзакции имеют `semanticType = expense`. Backfill по превью FT-045 применяется в FT-108 — только после того, как Шукур просмотрит список.

---

## В работе

### FT-168: Rename Daftar to Kapelka

Status: in_progress
Priority: high
Owner: Claude Code, QA — под-чат проверки
Type: rebrand
Size: M

Context:
Решение 2026-10-28: продукт называется Kapelka; переименовать до установки живого экземпляра на ПК (FT-159). Что
затрагивает переименование — `docs/NAMING.md`, раздел «Что затронет переименование». Шукур тем временем делает
Windows-часть установки — она от имени не зависит.

Definition of Done:
- [ ] Всё, что видит пользователь, называется Kapelka: webapp (заголовок, манифест PWA, wordmark, «Вход в … из браузера», подпись с версией), тексты и кнопки бота (`/start`, «Открыть … ↗», вход через бота), имя выгрузки `kapelka-<дата>.csv`, текст кнопки меню Mini App по умолчанию, wordmark в `docs/pastel/design-system.md` и `tokens.json`; в пользовательских строках `grep -ri daftar` пусто
- [ ] Не меняются, с комментарием в коде почему: cookie `daftar_session` / `daftar_login`, база Dexie `daftar-offline`; репозиторий и имя пакета тоже
- [ ] Живой экземпляр: `~/kapelka-live`, `kapelka.service`, `kapelka-backup.service` / `.timer`, папка бэкапа `C:\KapelkaBackup`, копии `kapelka-*.sqlite`, имя задачи Планировщика и `SyslogIdentifier` — в `ops/live/`, `scripts/`, `live-instance.md`, `troubleshooting.md`, `quick-start.md`, `CLAUDE.md` и в FT-159
- [ ] `live-instance.md`: ПК получает нового бота «Kapelka» из BotFather, @FinanceTrackerDevBot отходит маку (решение 2026-10-28)
- [ ] Документы о текущем состоянии говорят Kapelka (`CLAUDE.md`, `docs/pastel/README.md`, гайды по iPhone); архив и записи решений не переписываются
- [ ] `npm run verify` проходит; экраны с wordmark и вход в браузере — скриншоты 390 px в светлой и тёмной теме

---

## Очередь

Переезд на ПК: очередь кода и скриптов пройдена (FT-153…FT-158). Дальше — FT-159 «Переезд с мака на ПК» руками
Шукура, описание — в [`docs/tasks/backlog.md`](docs/tasks/backlog.md).

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
| [FT-146](docs/tasks/backlog.md) | Индикатор, пока разбирается фраза | вид по холсту |
| [FT-147](docs/tasks/backlog.md) | Заметку в ручном вводе сжимает клавиатура | вид по холсту |
| [FT-148](docs/tasks/backlog.md) | Отметка записей до даты открытия счёта | вид по холсту |
| [FT-149](docs/tasks/backlog.md) | Выбор счёта по умолчанию | место на холсте или решение Шукура |
| [FT-150](docs/tasks/backlog.md) | Голые «яндекс» и «uber» не должны давать «Транспорт» | команды Шукура взять в работу |
| [FT-151](docs/tasks/backlog.md) | Нестабильные HTTP-тесты: webLogin, transactionRoutes | команды Шукура взять в работу |
| [FT-152](docs/tasks/backlog.md) | Без сети класть сложную фразу в очередь и разбирать на сервере | детали — с Шукуром |
| [FT-159](docs/tasks/backlog.md) | Переезд с мака на ПК | FT-153…FT-157; руки Шукура |
| [FT-160](docs/tasks/backlog.md) | Shortcut на Action Button через Tailscale | FT-155, FT-159 |
| [FT-161](docs/tasks/backlog.md) | Минимальное iOS-приложение для быстрой записи | ответы Шукура на открытые вопросы; FT-160 |
| [FT-162](docs/tasks/backlog.md) | Старые маршруты с `:userId` — пользователь из авторизации | вместе с FT-136 |
| [FT-163](docs/tasks/backlog.md) | Записи до первого запуска входят в остаток дважды | команды Шукура взять в работу |
| [FT-164](docs/tasks/backlog.md) | Неушедшее уведомление оставляет след; попытки переживают перезапуск | команды Шукура взять в работу |
| [FT-165](docs/tasks/backlog.md) | Логи слоя application без времени и уровня | команды Шукура взять в работу |
| [FT-166](docs/tasks/backlog.md) | Отказы чужим в боте и API не засыпают лог | команды Шукура взять в работу |
| [FT-167](docs/tasks/backlog.md) | Перезапуск бота не теряет апдейты в обработке | команды Шукура взять в работу |
| [FT-169](docs/tasks/backlog.md) | Свой знак для Kapelka вместо страницы тетради | знак на холсте от Шукура |

---

## Что уже закрыто

167 задач: вехи 0–10 и весь отрезок до того, как появились вехи. Полные отчёты «Реализовано / Проверка» — в архиве.

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
