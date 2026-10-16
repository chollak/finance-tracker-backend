# Database Guide

Одна база — SQLite через TypeORM. Схема меняется только миграциями.

С FT-090 (веха 10, решение Д6) путь Supabase через `supabase-js` убран: отдельные репозитории, ручной SQL
в Supabase Editor и переключатель `DATABASE_TYPE=supabase` больше не существуют. История и старые SQL-файлы
остались в `migrations/` (корень репозитория) и в git; для приложения они не используются.

## Где что лежит

| Что | Где |
|---|---|
| Файл базы | `data/database.sqlite` (в `.gitignore`) |
| Копии перед миграциями | `data/backups/database-YYYYMMDD-HHmmss.sqlite` (в `.gitignore`) |
| Настройка TypeORM | `src/shared/infrastructure/database/database.config.ts` |
| Сущности | `src/shared/infrastructure/database/entities/` |
| Миграции | `src/shared/infrastructure/database/migrations/` — каждая отдельным классом, список в `index.ts` |
| Применение и проверка | `src/shared/infrastructure/database/migrationRunner.ts` |
| Команды | `src/shared/infrastructure/database/migrate.ts` |
| Репозитории | `Sqlite*Repository` в модулях, создаются через `RepositoryFactory` |

## Как это работает при запуске

1. `initializeDatabase()` открывает `data/database.sqlite` (файл и папка создаются сами).
2. Если есть неприменённые миграции, база сначала копируется в `data/backups/`. Новая пустая база не
   копируется. Потом миграции применяются, каждая в своей транзакции.
3. `findSchemaDrift()` сравнивает таблицы с сущностями. Если они расходятся (сущность изменили без миграции
   или базу правили руками), в лог пишется предупреждение с SQL, который понадобился бы. Сам этот SQL
   не выполняется.

`synchronize` выключен всегда: он не умеет менять типы и переносить данные и может молча удалить колонку.

Первая миграция `Baseline1760600000000` повторяет схему, которую раньше создавал `synchronize`. На старой
базе она только записывает себя в таблицу `migrations` (все `CREATE TABLE IF NOT EXISTS`), на новой —
создаёт все таблицы. Откатить её нельзя: откат удалил бы все данные.

## Суммы — целые в сотых долях

С FT-097 (`AmountMinor1760700000000`) сумма записи хранится в `transactions.amount_minor bigint`: тийины
для сумов, центы для долларов, одна шкала ×100. Миграция пересобрала таблицу и проверила каждую строку
(`amount_minor = round(amount × 100)`) и итоги по пользователю; при расхождении она останавливается и
ничего не меняет.

В коде суммы складываются только как целые — помощник `src/shared/domain/money/money.ts` (`toMinor`,
`fromMinor`, `sumMinor`, `minorOf`, `percentOf`, `resolveAmountMinor`). На переходный период запись
принимает и `amountMinor`, и старое `amount` в сумах, а ответы содержат оба поля; `amount` уйдёт в FT-136.
Бюджеты и долги не переведены (решение Д2): у них осталось `decimal`.

## Категории в базе

С FT-099 (`Categories1760900000000`) категории — таблица `categories`, у каждого пользователя свои 8 + 8.
Запись хранит `transactions.category_id`; старая строка категории осталась в `legacy_category` до FT-136.
Миграция создала стартовые категории всем пользователям из `users` и из `transactions.userId` и перевела
записи по таблице из `docs/pastel/money-model.md` с учётом типа: расход в «Зарплата» уходит в «Другое»
расходов. Отчёт «сколько куда» пишется в лог при миграции и выводится в любой момент:

```bash
npm run report:categories                 # по всем пользователям
npm run report:categories -- --user=<id>  # по одному
```

Новому пользователю стартовые категории создаются при первом обращении (`CategoryCatalog.listForUser`).
Обучение (`data/patterns.json`, `data/learning-data.json`) хранит ключи стартовых категорий (`cafe`,
`transport`); старые id переводятся при чтении и записываются по-новому при следующем сохранении.

## Счета

С FT-101 (`Accounts1761000000000`) есть таблица `accounts`, а у записи — `transactions.account_id`.
Миграция дала каждому пользователю счёт «Карта» (UZS) с остатком 0 на день миграции и перенесла на него всю
историю. Остаток считается на чтении: начальный остаток + записи по `type` с даты открытия (архивные не
входят). Поэтому старая история остаток не ломает; настоящие остатки задаёт первый запуск (FT-109).

С FT-103 (`RecordCurrencySource1761200000000`) у записи есть `currency` (`UZS` по умолчанию, у старых записей
тоже `UZS`) и `source` (`telegram`, `miniapp`, `ios_shortcut`, `receipt`, `manual`; у старых записей пусто).
В остаток счёта входят только записи в валюте счёта: «55$», сохранённые на сумовый счёт за неимением
долларового, ждут проверки и в остаток не входят, пока их не перенесут.

## Курс доллара

С FT-102 (`FxRates1761100000000`) курсы ЦБ хранятся в `fx_rates` (дата, валюта, `rate_minor` — сумы×100 за
доллар). Приложение запрашивает курс при старте и раз в час, пока нет курса на сегодня. Без интернета в логе
будет предупреждение `CBU rate unavailable` — это не ошибка: действует последний известный курс.

## Команды

```bash
npm run migration:show     # какие миграции применены [x] и какие ждут [ ]; совпадает ли схема с сущностями
npm run migration:run      # копия базы в data/backups/, потом все ждущие миграции
npm run migration:revert   # копия базы, потом откат последней миграции
```

Команды сначала собирают проект (`npm run build`) и запускают `dist/.../migrate.js`.

Вернуть базу из копии: остановить приложение и скопировать файл из `data/backups/` на место
`data/database.sqlite`.

## Как изменить схему

1. Изменить сущность в `src/shared/infrastructure/database/entities/`.
2. Добавить миграцию `src/shared/infrastructure/database/migrations/<timestamp>-<Name>.ts`: класс
   `<Name><timestamp>` с `up()` и, если откат безопасен, `down()`. Перенос данных — в той же миграции.
3. Добавить класс в `MIGRATIONS` в `migrations/index.ts`.
4. Тест на настоящем SQLite во временной папке: после миграции `findSchemaDrift()` пустой, данные на месте.
   Пример — `tests/databaseMigrations.test.ts`.

SQL для новой миграции удобно получить так: изменить сущность и запустить `npm run migration:show` — он
выведет, что пришлось бы выполнить. Для SQLite изменения колонок TypeORM делает через пересоздание таблицы;
проверяйте, что данные переносятся.

## Посмотреть базу

```bash
sqlite3 data/database.sqlite
.tables
.schema transactions
SELECT * FROM migrations;
.quit
```

## Частые проблемы

- **`DriverPackageNotInstalledError: SQLite package has not been found`** — не собран нативный модуль
  `sqlite3` (например, после `npm ci --ignore-scripts`). Выполнить `npm rebuild sqlite3`.
- **`SQLITE_BUSY: database is locked`** — писать в файл может один процесс. Остановить второй экземпляр
  приложения или открытый `sqlite3` с незавершённой транзакцией.
- **В логе «Database schema differs from entities»** — сущность изменили без миграции. Добавить миграцию,
  а не включать `synchronize`.
- **`DATABASE_TYPE=supabase is not supported`** — удалить `DATABASE_TYPE` из `.env` или поставить `sqlite`.

## См. также

- [Quick Start](quick-start.md)
- [Модель денег вехи 10](../../pastel/money-model.md) — какие таблицы и миграции впереди
