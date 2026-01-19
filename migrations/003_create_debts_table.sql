-- Migration: Create debts and debt_payments tables
-- Date: 2026-01-18

-- Create debts table
CREATE TABLE IF NOT EXISTS debts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL,
    type VARCHAR(20) NOT NULL DEFAULT 'i_owe' CHECK (type IN ('i_owe', 'owed_to_me')),
    person_name TEXT NOT NULL,
    original_amount DECIMAL(12, 2) NOT NULL,
    remaining_amount DECIMAL(12, 2) NOT NULL,
    currency VARCHAR(10) DEFAULT 'UZS',
    description TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paid', 'cancelled')),
    due_date DATE,
    -- Link to transaction (when money was actually transferred)
    related_transaction_id UUID,
    -- Split expenses support (for future)
    split_group_id UUID,
    split_expense_id UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add debt-related fields to transactions table
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS is_debt_related BOOLEAN DEFAULT FALSE;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS related_debt_id UUID;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS split_group_id UUID;

-- Create debt_payments table
CREATE TABLE IF NOT EXISTS debt_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    debt_id UUID NOT NULL REFERENCES debts(id) ON DELETE CASCADE,
    amount DECIMAL(12, 2) NOT NULL,
    note TEXT,
    paid_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_debts_user_id ON debts(user_id);
CREATE INDEX IF NOT EXISTS idx_debts_status ON debts(status);
CREATE INDEX IF NOT EXISTS idx_debts_type ON debts(type);
CREATE INDEX IF NOT EXISTS idx_debt_payments_debt_id ON debt_payments(debt_id);

-- Create trigger to update updated_at on debts
CREATE OR REPLACE FUNCTION update_debts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_debts_updated_at ON debts;
CREATE TRIGGER trigger_debts_updated_at
    BEFORE UPDATE ON debts
    FOR EACH ROW
    EXECUTE FUNCTION update_debts_updated_at();

-- Enable Row Level Security
ALTER TABLE debts ENABLE ROW LEVEL SECURITY;
ALTER TABLE debt_payments ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for debts
CREATE POLICY "Users can view own debts" ON debts
    FOR SELECT USING (true);

CREATE POLICY "Users can insert own debts" ON debts
    FOR INSERT WITH CHECK (true);

CREATE POLICY "Users can update own debts" ON debts
    FOR UPDATE USING (true);

CREATE POLICY "Users can delete own debts" ON debts
    FOR DELETE USING (true);

-- Create RLS policies for debt_payments
CREATE POLICY "Users can view debt payments" ON debt_payments
    FOR SELECT USING (true);

CREATE POLICY "Users can insert debt payments" ON debt_payments
    FOR INSERT WITH CHECK (true);

CREATE POLICY "Users can delete debt payments" ON debt_payments
    FOR DELETE USING (true);
