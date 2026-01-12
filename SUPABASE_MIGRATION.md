# Миграция с SQLite на Supabase

Это руководство поможет вам мигрировать финансовый трекер с SQLite на Supabase PostgreSQL.

## Шаг 1: Настройка Supabase

1. Создайте новый проект в [Supabase](https://supabase.com)
2. Получите URL проекта и анонимный ключ из настроек проекта
3. Выполните SQL миграцию для создания таблиц

### SQL миграция

Выполните следующий SQL скрипт в SQL Editor вашего Supabase проекта:

```sql
-- Включить UUID расширение
create extension if not exists "uuid-ossp";

-- Создать таблицу транзакций
create table if not exists transactions (
  id uuid default uuid_generate_v4() primary key,
  amount decimal(10, 2) not null,
  type text not null check (type in ('income', 'expense')),
  description text not null,
  date date not null,
  merchant text,
  confidence decimal(3, 2),
  original_text text,
  original_parsing text,
  tags text,
  user_id text not null,
  category text default 'Другое',
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

-- Создать таблицу бюджетов
create table if not exists budgets (
  id uuid default uuid_generate_v4() primary key,
  name text not null,
  amount decimal(10, 2) not null,
  period text not null default 'monthly' check (period in ('daily', 'weekly', 'monthly', 'quarterly', 'yearly')),
  start_date date not null,
  end_date date not null,
  category_ids text,
  is_active boolean default true,
  spent decimal(10, 2) default 0,
  description text,
  user_id text not null,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

-- Создать индексы для лучшей производительности
create index if not exists idx_transactions_user_id on transactions(user_id);
create index if not exists idx_transactions_date on transactions(date);
create index if not exists idx_transactions_type on transactions(type);
create index if not exists idx_transactions_user_date on transactions(user_id, date desc);

create index if not exists idx_budgets_user_id on budgets(user_id);
create index if not exists idx_budgets_active on budgets(is_active);
create index if not exists idx_budgets_dates on budgets(start_date, end_date);

-- Функция для обновления времени updated_at
create or replace function update_updated_at_column()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- Создать триггеры для updated_at
create trigger update_transactions_updated_at
  before update on transactions
  for each row
  execute function update_updated_at_column();

create trigger update_budgets_updated_at
  before update on budgets
  for each row
  execute function update_updated_at_column();
```

## Шаг 2: Обновление переменных окружения

Обновите файл `.env` или создайте `.env.local`:

```env
# Переключиться на Supabase
DATABASE_TYPE=supabase

# Настройки Supabase (получить из настроек проекта)
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_ANON_KEY=your-anon-key-here

# Остальные настройки остаются без изменений
OPENAI_API_KEY=your_openai_key
TG_BOT_API_KEY=your_telegram_bot_key
# ...
```

## Шаг 3: Миграция данных (опционально)

Если у вас есть существующие данные в SQLite, создайте скрипт миграции:

```typescript
// scripts/migrate-to-supabase.ts
import { AppDataSource } from '../src/shared/infrastructure/database/database.config';
import { getSupabaseClient } from '../src/shared/infrastructure/database/supabase.config';

async function migrateData() {
  // Инициализировать SQLite
  await AppDataSource.initialize();
  const supabase = getSupabaseClient();
  
  // Мигрировать транзакции
  const transactions = await AppDataSource.getRepository('Transaction').find();
  for (const transaction of transactions) {
    await supabase.from('transactions').insert({
      amount: transaction.amount,
      type: transaction.type,
      description: transaction.description,
      date: transaction.date,
      merchant: transaction.merchant,
      confidence: transaction.confidence,
      original_text: transaction.originalText,
      original_parsing: transaction.originalParsing,
      user_id: transaction.userId,
      category: transaction.category || 'Другое'
    });
  }
  
  console.log(`Мигрировано ${transactions.length} транзакций`);
}
```

## Шаг 4: Тестирование

1. Запустите приложение: `npm run dev:full`
2. Проверьте, что приложение успешно подключается к Supabase
3. Создайте тестовую транзакцию через API или интерфейс
4. Проверьте, что данные сохраняются в Supabase

## Переключение обратно на SQLite

Если нужно вернуться к SQLite, измените переменную:

```env
DATABASE_TYPE=sqlite
```

## Различия между SQLite и Supabase

| Функция | SQLite | Supabase |
|---------|--------|----------|
| Тип БД | Файловая | PostgreSQL (облачная) |
| Масштабируемость | Ограниченная | Высокая |
| Concurrent access | Ограниченный | Полная поддержка |
| Backup | Файл | Автоматический |
| Authentication | Нет | Встроенная |
| Real-time | Нет | Да |

## Возможные проблемы

1. **Проблемы с типами данных**: PostgreSQL более строг к типам
2. **UUID vs автоинкремент**: Supabase использует UUID, SQLite - integer
3. **Проблемы с кодировкой**: Убедитесь в правильной настройке UTF-8

## Дополнительные возможности Supabase

После миграции вы можете воспользоваться дополнительными возможностями:

- Row Level Security (RLS) для безопасности
- Real-time подписки на изменения
- Встроенная аутентификация
- Автоматические API endpoints
- Dashboard для администрирования