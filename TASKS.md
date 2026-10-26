# Finance Tracker — Task Board

Активная доска. Здесь только живая работа: задача в работе, очередь за ней и список отложенного.
Закрытые задачи сюда не возвращаются.

| Что нужно | Где смотреть |
|---|---|
| Как устроена доска, статусы, роли | [`docs/tasks/README.md`](docs/tasks/README.md) |
| Почему план такой — лог решений | [`docs/tasks/decisions.md`](docs/tasks/decisions.md) |
| Отложенные задачи, полные описания (19) | [`docs/tasks/backlog.md`](docs/tasks/backlog.md) |
| Закрытые задачи с отчётами (108) | [`docs/tasks/archive/`](docs/tasks/archive/) |

---

## Текущий фокус — веха 10: перенос дизайна «Пастель» в код

Новый дизайн Daftar («Пастель») переносится в этот проект — не с нуля. План, карта кода, сверка экранов,
модель денег и все задачи вехи: [`docs/pastel/`](docs/pastel/README.md). Решения Д1–Д7 приняты Шукуром
2026-10-16 (см. `docs/tasks/decisions.md`). Веха 9 закрыта: FT-082…FT-086 отменены, их цели вошли в веху 10.

Задачи FT-087…FT-136 разбиты на фазы 0–10. Полные описания — [`docs/pastel/tasks.md`](docs/pastel/tasks.md);
в доску задачи переносятся по фазам. Порядок задаёт поле `Depends`, а не номер. Экран сверяют скриншотом
с доской холста из поля `Design`, в светлой и тёмной теме. Правила дизайна — `docs/pastel/design-system.md`
и `docs/pastel/components/`; старые гайды в `docs/knowledge-base/10-design-guidelines/` заменит FT-096.

Прогресс вехи: **фаза 0** — FT-087 в работе · FT-088 · FT-089 · FT-090 · FT-091

### Постоянный контекст

- Прод и AWS выключены намеренно и в планы не входят (решение 2026-08-13). Рантайм — локальный WSL + SQLite + Telegram polling + Cloudflare quick tunnel для теста Mini App с телефона.
- Supabase-проект на паузе, не удалён. Локально `DATABASE_TYPE=sqlite`. По решению Д6 путь `supabase-js` уходит из сборки (FT-090).
- Все исторические транзакции имеют `semanticType = expense`. Backfill по превью FT-045 применяется в FT-108 — только после того, как Шукур просмотрит список.

---

## В работе

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

---

## Очередь

Фаза 0 вехи 10. Порядок задаёт `Depends`; задачу можно брать, когда закрыто всё, от чего она зависит.
Следующие фазы — в [`docs/pastel/tasks.md`](docs/pastel/tasks.md).

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

---

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

---

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

---

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
| [FT-062](docs/tasks/backlog.md) | Состав главного экрана и приоритет секций | решено дизайном «Пастели» (веха 10) — закрыть вместе с FT-111 |
| [FT-063](docs/tasks/backlog.md) | Сроки долгов и напоминания | продуктовое решение Шукура |
| [FT-069](docs/tasks/backlog.md) | Граница premium некогерентна и обходится | политика монетизации |
| [FT-071](docs/tasks/backlog.md) | Rate limits тесноваты под реальное использование | политика лимитов |
| [FT-144](docs/tasks/backlog.md) | Итог дня и напоминания теряются после сбоя сети (сон мака) | команды Шукура взять в работу |
| [FT-145](docs/tasks/backlog.md) | Таймаут и повторы для OpenAI: сейчас до 30 минут ожидания | команды Шукура взять в работу |
| [FT-146](docs/tasks/backlog.md) | Индикатор, пока разбирается фраза | вид по холсту |
| [FT-147](docs/tasks/backlog.md) | Заметку в ручном вводе сжимает клавиатура | вид по холсту |
| [FT-148](docs/tasks/backlog.md) | Отметка записей до даты открытия счёта | вид по холсту |
| [FT-149](docs/tasks/backlog.md) | Выбор счёта по умолчанию | место на холсте или решение Шукура |
| [FT-150](docs/tasks/backlog.md) | Голые «яндекс» и «uber» не должны давать «Транспорт» | команды Шукура взять в работу |
| [FT-151](docs/tasks/backlog.md) | Нестабильный `webLogin.test.ts` | команды Шукура взять в работу |
| [FT-152](docs/tasks/backlog.md) | Без сети класть сложную фразу в очередь и разбирать на сервере | детали — с Шукуром |

---

## Что уже закрыто

108 задач: вехи 0–9 и весь отрезок до того, как появились вехи. Полные отчёты «Реализовано / Проверка» — в архиве.

| Отрезок | Задачи | Файл |
|---|---|---|
| Фундамент: стабилизация, аудиты, архитектура | FT-000…FT-024 | [`ft-000-024-foundation.md`](docs/tasks/archive/ft-000-024-foundation.md) |
| Продукт и UI: дизайн-система, вёрстка, ввод | FT-025…FT-041 | [`ft-025-041-product-ui.md`](docs/tasks/archive/ft-025-041-product-ui.md) |
| Семантические транзакции | FT-SEM-001…006 | [`ft-sem-semantic-transactions.md`](docs/tasks/archive/ft-sem-semantic-transactions.md) |
| Relaunch: локальный контур и доверие к цифрам | FT-042…FT-072 | [`ft-042-072-relaunch.md`](docs/tasks/archive/ft-042-072-relaunch.md) |
| Quick capture и первые срезы редизайна | FT-073…FT-081 | [`ft-073-081-quick-action.md`](docs/tasks/archive/ft-073-081-quick-action.md) |
| Веха 9, отменённый остаток (заменён «Пастелью») | FT-082…FT-086 | [`ft-082-086-quick-action-cancelled.md`](docs/tasks/archive/ft-082-086-quick-action-cancelled.md) |
