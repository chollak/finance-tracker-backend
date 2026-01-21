-- Migration Script: Fix userId Inconsistency
-- This script resolves the userId mismatch between modules
--
-- Run: sqlite3 data/database.sqlite < scripts/migrate-userId.sql

-- Show current state
.echo on
.headers on

SELECT 'Before Migration:' as status;
SELECT DISTINCT userId FROM transactions;

-- Step 1: Update transactions that use 'test_user_dev' telegramId
-- to use the corresponding UUID
UPDATE transactions
SET userId = (SELECT id FROM users WHERE telegram_id = 'test_user_dev')
WHERE userId = 'test_user_dev'
  AND EXISTS (SELECT 1 FROM users WHERE telegram_id = 'test_user_dev');

-- Step 2: Update transactions that use 'test_audit_user_123' telegramId
-- (Only needed if these transactions aren't already using UUID)
UPDATE transactions
SET userId = (SELECT id FROM users WHERE telegram_id = 'test_audit_user_123')
WHERE userId = 'test_audit_user_123'
  AND EXISTS (SELECT 1 FROM users WHERE telegram_id = 'test_audit_user_123');

-- Step 3: Clean up orphan user (user with UUID stored as telegram_id)
-- First show what we'll delete
SELECT 'Orphan users to delete:' as status;
SELECT id, telegram_id FROM users
WHERE telegram_id LIKE '%-%-%-%-%'
  AND length(telegram_id) = 36;

-- Delete orphan users
DELETE FROM users
WHERE telegram_id LIKE '%-%-%-%-%'
  AND length(telegram_id) = 36;

-- Verify migration
SELECT 'After Migration:' as status;
SELECT DISTINCT userId FROM transactions;

-- Check for any remaining non-UUID userIds
SELECT 'Non-UUID userIds remaining:' as status;
SELECT DISTINCT userId FROM transactions
WHERE userId NOT LIKE '%-%-%-%-%';

SELECT 'Migration completed!' as status;
