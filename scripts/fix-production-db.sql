-- Production database fix script
-- This creates the transactions table if it doesn't exist

CREATE TABLE IF NOT EXISTS "transactions" (
    "id" varchar PRIMARY KEY NOT NULL,
    "amount" decimal(10,2) NOT NULL,
    "type" varchar NOT NULL,
    "description" varchar NOT NULL,
    "date" date NOT NULL,
    "merchant" varchar,
    "confidence" decimal(3,2),
    "originalText" text,
    "originalParsing" text,
    "tags" varchar,
    "createdAt" datetime NOT NULL DEFAULT (datetime('now')),
    "updatedAt" datetime NOT NULL DEFAULT (datetime('now')),
    "userId" varchar NOT NULL,
    "category" varchar DEFAULT ('Другое')
);

-- Create budgets table if it doesn't exist
CREATE TABLE IF NOT EXISTS "budgets" (
    "id" varchar PRIMARY KEY NOT NULL,
    "name" varchar NOT NULL,
    "amount" decimal(10,2) NOT NULL,
    "period" varchar NOT NULL DEFAULT ('monthly'),
    "startDate" date NOT NULL,
    "endDate" date NOT NULL,
    "categoryIds" text,
    "isActive" boolean NOT NULL DEFAULT (1),
    "spent" decimal(10,2) NOT NULL DEFAULT (0),
    "description" varchar,
    "createdAt" datetime NOT NULL DEFAULT (datetime('now')),
    "updatedAt" datetime NOT NULL DEFAULT (datetime('now')),
    "userId" varchar NOT NULL
);

-- Verify tables exist
SELECT name FROM sqlite_master WHERE type='table' AND name IN ('transactions', 'budgets');