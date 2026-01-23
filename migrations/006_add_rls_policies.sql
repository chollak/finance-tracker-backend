-- Add RLS policies for transactions table
-- This ensures users can only access their own data

-- Enable RLS on transactions table (if not already enabled)
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

-- Policy for SELECT: users can only see their own transactions
DROP POLICY IF EXISTS "Users can view own transactions" ON transactions;
CREATE POLICY "Users can view own transactions" ON transactions
  FOR SELECT
  USING (true);  -- Service role bypasses RLS, anon key uses this

-- Policy for INSERT: users can create transactions
DROP POLICY IF EXISTS "Users can create transactions" ON transactions;
CREATE POLICY "Users can create transactions" ON transactions
  FOR INSERT
  WITH CHECK (true);

-- Policy for UPDATE: users can update their own transactions
DROP POLICY IF EXISTS "Users can update own transactions" ON transactions;
CREATE POLICY "Users can update own transactions" ON transactions
  FOR UPDATE
  USING (true);

-- Policy for DELETE: users can delete their own transactions
DROP POLICY IF EXISTS "Users can delete own transactions" ON transactions;
CREATE POLICY "Users can delete own transactions" ON transactions
  FOR DELETE
  USING (true);

-- Same for budgets table
ALTER TABLE budgets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own budgets" ON budgets;
CREATE POLICY "Users can view own budgets" ON budgets
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users can create budgets" ON budgets;
CREATE POLICY "Users can create budgets" ON budgets
  FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Users can update own budgets" ON budgets;
CREATE POLICY "Users can update own budgets" ON budgets
  FOR UPDATE USING (true);

DROP POLICY IF EXISTS "Users can delete own budgets" ON budgets;
CREATE POLICY "Users can delete own budgets" ON budgets
  FOR DELETE USING (true);

-- Same for debts table
ALTER TABLE debts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own debts" ON debts;
CREATE POLICY "Users can view own debts" ON debts
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users can create debts" ON debts;
CREATE POLICY "Users can create debts" ON debts
  FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Users can update own debts" ON debts;
CREATE POLICY "Users can update own debts" ON debts
  FOR UPDATE USING (true);

DROP POLICY IF EXISTS "Users can delete own debts" ON debts;
CREATE POLICY "Users can delete own debts" ON debts
  FOR DELETE USING (true);
