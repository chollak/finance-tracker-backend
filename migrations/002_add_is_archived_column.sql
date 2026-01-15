-- Migration: Add is_archived column to transactions table
-- Purpose: Support transaction archiving without deletion

-- Add is_archived column with default false
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS is_archived boolean DEFAULT false;

-- Create composite index for efficient filtering by user and archive status
CREATE INDEX IF NOT EXISTS idx_transactions_user_archived ON transactions(user_id, is_archived);
