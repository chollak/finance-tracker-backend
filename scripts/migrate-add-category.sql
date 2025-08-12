-- Migration script to add category column to transactions table
-- Run this on your server database

-- Check if column exists, if not add it
PRAGMA table_info(transactions);

-- Add category column if it doesn't exist
-- Note: SQLite doesn't support IF NOT EXISTS for ALTER TABLE
-- So we need to be careful about running this multiple times

-- Create new table with category column
CREATE TABLE transactions_new (
    id VARCHAR PRIMARY KEY NOT NULL,
    amount DECIMAL(10,2) NOT NULL,
    type VARCHAR NOT NULL,
    description VARCHAR NOT NULL,
    date DATE NOT NULL,
    merchant VARCHAR,
    confidence DECIMAL(3,2),
    originalText TEXT,
    originalParsing TEXT,
    tags VARCHAR,
    createdAt DATETIME NOT NULL DEFAULT (datetime('now')),
    updatedAt DATETIME NOT NULL DEFAULT (datetime('now')),
    userId VARCHAR NOT NULL,
    category VARCHAR DEFAULT 'Другое'
);

-- Copy data from old table to new table
INSERT INTO transactions_new (
    id, amount, type, description, date, merchant, confidence, 
    originalText, originalParsing, tags, createdAt, updatedAt, userId, category
)
SELECT 
    id, amount, type, description, date, merchant, confidence,
    originalText, originalParsing, tags, createdAt, updatedAt, userId, 'Другое'
FROM transactions;

-- Drop old table
DROP TABLE transactions;

-- Rename new table
ALTER TABLE transactions_new RENAME TO transactions;