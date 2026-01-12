# Database Guide

Работа с SQLite и Supabase, миграция между ними.

## Database Options

Проект поддерживает две базы данных:

| Feature | SQLite | Supabase (PostgreSQL) |
|---------|--------|----------------------|
| **Тип** | Файловая | Облачная |
| **Setup** | Автоматически | Требует настройки |
| **Масштабирование** | Ограниченное | Высокое |
| **Concurrent Access** | Limited | Full support |
| **Backup** | Копирование файла | Автоматический |
| **Cost** | Бесплатно | Freemium model |
| **Real-time** | Нет | Да |
| **Best For** | Development, MVP | Production, Scale |

---

## SQLite (Default)

### Configuration

**.env:**
```bash
DATABASE_TYPE=sqlite
```

Или просто не указывать (default).

### Location

```
data/database.sqlite
```

### Auto-sync

В development mode таблицы создаются автоматически:

```typescript
// database.config.ts
synchronize: process.env.NODE_ENV === 'development'
```

⚠️ **Warning:** `synchronize: true` опасно в production!

### Inspect Database

```bash
sqlite3 data/database.sqlite

# Commands
.tables                          # List tables
.schema transactions             # Show table schema
SELECT * FROM transactions;      # Query data
.quit                           # Exit
```

### Backup

```bash
cp data/database.sqlite data/database-backup-$(date +%Y%m%d).sqlite
```

---

## Supabase

### Setup

#### 1. Create Supabase Project

1. Перейти на [supabase.com](https://supabase.com)
2. Sign up / Login
3. Create new project
4. Wait for provisioning

#### 2. Get Credentials

В Project Settings → API:
- **URL**: `https://xxx.supabase.co`
- **Anon public key**: `eyJhbGc...`

#### 3. Configure .env

```bash
DATABASE_TYPE=supabase
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_ANON_KEY=eyJhbGc...
```

#### 4. Run Migrations

Выполнить SQL в Supabase Dashboard → SQL Editor:

```sql
-- File: migrations/001_initial_schema.sql
CREATE TABLE transactions (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  amount DECIMAL(10,2) NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
  description TEXT NOT NULL,
  date DATE NOT NULL,
  category TEXT DEFAULT 'Другое',
  user_id TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_transactions_user_id ON transactions(user_id);
CREATE INDEX idx_transactions_date ON transactions(date);

-- More tables...
```

Полный SQL: [`migrations/001_initial_schema.sql`](../../../migrations/001_initial_schema.sql)

#### 5. Test Connection

```bash
npm run supabase:test
```

---

## Migration: SQLite → Supabase

Полный гайд: [`SUPABASE_MIGRATION.md`](../../../SUPABASE_MIGRATION.md)

### Quick Steps

#### 1. Setup Supabase (see above)

#### 2. Export Data from SQLite

```bash
sqlite3 data/database.sqlite .dump > backup.sql
```

#### 3. Transform SQL for PostgreSQL

SQLite и PostgreSQL имеют различия:
- Primary keys: `INTEGER` → `UUID`
- Auto-increment → `uuid_generate_v4()`
- Date format differences

#### 4. Import to Supabase

```sql
-- In Supabase SQL Editor
-- Copy/paste transformed SQL
```

#### 5. Switch Configuration

```bash
# .env
DATABASE_TYPE=supabase
```

#### 6. Restart Application

```bash
npm run dev
```

---

## Repository Factory Pattern

Переключение между БД происходит автоматически:

```typescript
// src/shared/infrastructure/database/repositoryFactory.ts
class RepositoryFactory {
  static createTransactionRepository(): TransactionRepository {
    if (AppConfig.DATABASE_TYPE === 'supabase') {
      return new SupabaseTransactionRepository();
    }
    return new SqliteTransactionRepository();
  }
}
```

**Use cases не знают о конкретной БД** - работают через интерфейс!

---

## Key Differences

### Primary Keys

**SQLite:**
```typescript
@PrimaryGeneratedColumn()
id!: number; // Auto-increment integer
```

**Supabase:**
```sql
id UUID DEFAULT uuid_generate_v4() PRIMARY KEY
```

### Column Names

**SQLite (TypeORM):**
```typescript
@Column()
userId!: string; // camelCase
```

**Supabase:**
```sql
user_id TEXT -- snake_case
```

**Mapping handled in repositories:**
```typescript
// Supabase Repository
{ user_id: transaction.userId }
```

### Date Handling

**SQLite:**
```sql
DATE -- Stored as string
```

**Supabase:**
```sql
DATE -- True date type
TIMESTAMP WITH TIME ZONE -- For timestamps
```

---

## Testing Different Databases

### Run Tests Against SQLite

```bash
DATABASE_TYPE=sqlite npm test
```

### Run Tests Against Supabase

```bash
DATABASE_TYPE=supabase npm test
```

**Note:** Нужны реальные Supabase credentials в `.env.test`.

---

## Schema Management

### SQLite

**Auto-sync (Development):**
```typescript
synchronize: true // Automatically updates schema
```

**Manual (Production):**
```bash
# Create migration
npm run typeorm migration:generate -- -n AddColumn

# Run migration
npm run typeorm migration:run
```

### Supabase

**Manual Migrations:**
1. Write SQL в `migrations/` folder
2. Выполнить в Supabase SQL Editor
3. Track в git

**Version Control:**
```
migrations/
├── 001_initial_schema.sql
├── 002_add_notifications.sql
└── 003_add_indexes.sql
```

---

## Performance Optimization

### Indexes

**SQLite:**
```sql
CREATE INDEX idx_transactions_user_date
ON transactions(user_id, date DESC);
```

**Supabase:**
```sql
CREATE INDEX idx_transactions_user_date
ON transactions(user_id, date DESC);
```

### Connection Pooling

**SQLite:**
- Не требуется (файловая БД)
- TypeORM управляет connections

**Supabase:**
- HTTP connections с keep-alive
- Automatic connection management

---

## Troubleshooting

### SQLite Issues

**Problem:** `SQLITE_CANTOPEN`
```bash
mkdir -p data
chmod 755 data
```

**Problem:** Database locked
```bash
# Only one process can write at a time
# Ensure no other instances running
```

### Supabase Issues

**Problem:** Connection timeout
```bash
# Check firewall settings
# Verify SUPABASE_URL and KEY
```

**Problem:** RLS (Row Level Security) errors
```sql
-- Disable RLS for development
ALTER TABLE transactions DISABLE ROW LEVEL SECURITY;
```

---

## Best Practices

### Development
✅ Use SQLite для быстрого старта
✅ Test с обеими БД перед production
✅ Keep migrations в git

### Production
✅ Use Supabase для масштабирования
✅ Enable backups
✅ Monitor query performance
✅ Set up database indexes

---

## Successful Migration (January 2026)

**Статус:** ✅ Миграция на Supabase успешно завершена!

**Результаты миграции:**
- ✅ **116 транзакций** мигрировано из SQLite в Supabase
- ✅ **1 бюджет** мигрирован
- ✅ **0 ошибок** - все данные перенесены корректно
- ✅ **Тесты пройдены** - подключение, запросы и индексы работают

**Выполненные шаги:**
1. ✅ SQL schema создана в Supabase (tables, indexes, triggers)
2. ✅ Скрипт миграции данных (`scripts/migrate-to-supabase.ts`) создан
3. ✅ Backup SQLite базы сохранен (`data/database.sqlite.backup`)
4. ✅ Данные мигрированы batch inserts (100 записей за раз)
5. ✅ Подключение протестировано (`scripts/test-supabase-connection.ts`)
6. ✅ `.env.local` настроен с `DATABASE_TYPE=supabase`

**Текущая конфигурация:**
```env
DATABASE_TYPE=supabase
SUPABASE_URL=https://cttsquvkvkwtxsfrgsrs.supabase.co
SUPABASE_ANON_KEY=eyJhbGci...
```

**Как использовать:**
- Приложение автоматически использует Supabase (через `RepositoryFactory`)
- SQLite backup сохранен для отката при необходимости
- Переключение обратно: изменить `DATABASE_TYPE=sqlite` в `.env.local`

**Скрипты миграции:**
- [`scripts/migrate-to-supabase.ts`](../../../scripts/migrate-to-supabase.ts) - миграция данных
- [`scripts/test-supabase-connection.ts`](../../../scripts/test-supabase-connection.ts) - тест подключения

---

## См. также

- [`SUPABASE_MIGRATION.md`](../../../SUPABASE_MIGRATION.md) - Полный гайд по миграции
- [Architecture Overview](../01-architecture/overview.md) - Repository Pattern
- [Quick Start](quick-start.md) - Initial setup
