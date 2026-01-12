-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- Create transactions table
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

-- Create budgets table
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

-- Create indexes for better performance
create index if not exists idx_transactions_user_id on transactions(user_id);
create index if not exists idx_transactions_date on transactions(date);
create index if not exists idx_transactions_type on transactions(type);
create index if not exists idx_transactions_user_date on transactions(user_id, date desc);

create index if not exists idx_budgets_user_id on budgets(user_id);
create index if not exists idx_budgets_active on budgets(is_active);
create index if not exists idx_budgets_dates on budgets(start_date, end_date);

-- Function to update updated_at timestamp
create or replace function update_updated_at_column()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- Create triggers for updated_at
create trigger update_transactions_updated_at
  before update on transactions
  for each row
  execute function update_updated_at_column();

create trigger update_budgets_updated_at
  before update on budgets
  for each row
  execute function update_updated_at_column();