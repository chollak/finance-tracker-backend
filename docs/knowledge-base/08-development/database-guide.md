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
