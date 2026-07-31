-- Add needs_review column to transactions table
-- Flags a transaction as uncertain (ambiguous parsing/categorization) so it can
-- surface in a future correction UI / weekly review, without inventing a new
-- semantic_type. Direction (`type`) and meaning (`semantic_type`) are unaffected.
--
-- NOTE: This migration is NOT applied automatically. Run it manually against
-- Supabase (SQL Editor) only after explicit approval.

alter table transactions
  add column if not exists needs_review boolean not null default false;

create index if not exists idx_transactions_needs_review on transactions(needs_review);
create index if not exists idx_transactions_user_needs_review on transactions(user_id, needs_review);
