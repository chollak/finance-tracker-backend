-- Add semantic_type column to transactions table
-- Legacy `type` (income/expense) remains the cashflow direction.
-- `semantic_type` captures the meaning (real expense, transfer, saving, debt, etc.)
-- so analytics/budgets can later count only real spending.
--
-- NOTE: This migration is NOT applied automatically. Run it manually against
-- Supabase (SQL Editor) only after explicit approval.

alter table transactions
  add column if not exists semantic_type text not null default 'expense';

alter table transactions
  drop constraint if exists transactions_semantic_type_check;

alter table transactions
  add constraint transactions_semantic_type_check
  check (semantic_type in (
    'expense',
    'income',
    'own_transfer',
    'saving_deposit',
    'debt',
    'reimbursement',
    'cash_withdrawal',
    'group_payment'
  ));

create index if not exists idx_transactions_semantic_type on transactions(semantic_type);
create index if not exists idx_transactions_user_semantic_date on transactions(user_id, semantic_type, date desc);
