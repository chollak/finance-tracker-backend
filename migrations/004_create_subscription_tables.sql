-- Migration: Create subscription and usage_limits tables
-- Description: Adds tables for premium subscriptions and usage tracking

-- =====================================================
-- SUBSCRIPTIONS TABLE
-- Stores user subscription information
-- =====================================================
CREATE TABLE IF NOT EXISTS subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tier VARCHAR(20) NOT NULL DEFAULT 'free' CHECK (tier IN ('free', 'premium')),
  source VARCHAR(20) NOT NULL DEFAULT 'payment' CHECK (source IN ('payment', 'trial', 'gift', 'lifetime')),
  status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'expired', 'cancelled')),
  price_stars INTEGER NOT NULL DEFAULT 100,
  currency VARCHAR(10) NOT NULL DEFAULT 'XTR',
  start_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  end_date TIMESTAMPTZ,
  trial_ends_at TIMESTAMPTZ,
  telegram_payment_charge_id VARCHAR(255),
  provider_payment_charge_id VARCHAR(255),
  auto_renew BOOLEAN NOT NULL DEFAULT true,
  granted_by VARCHAR(255),
  grant_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  cancelled_at TIMESTAMPTZ,
  cancellation_reason TEXT
);

-- Indexes for subscriptions
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_subscriptions_end_date ON subscriptions(end_date) WHERE status = 'active';

-- =====================================================
-- USAGE_LIMITS TABLE
-- Tracks user usage for free tier limits
-- =====================================================
CREATE TABLE IF NOT EXISTS usage_limits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,
  transactions_count INTEGER NOT NULL DEFAULT 0,
  voice_inputs_count INTEGER NOT NULL DEFAULT 0,
  active_debts_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for usage_limits
CREATE INDEX IF NOT EXISTS idx_usage_limits_user_id ON usage_limits(user_id);

-- =====================================================
-- TRIGGERS FOR updated_at
-- =====================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_subscriptions_updated_at
  BEFORE UPDATE ON subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_usage_limits_updated_at
  BEFORE UPDATE ON usage_limits
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- ROW LEVEL SECURITY (RLS)
-- =====================================================
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_limits ENABLE ROW LEVEL SECURITY;

-- Subscriptions: Users can only view their own subscriptions
CREATE POLICY "Users can view own subscriptions" ON subscriptions
  FOR SELECT
  USING (user_id::text = auth.uid()::text);

-- Usage limits: Users can only view their own usage
CREATE POLICY "Users can view own usage limits" ON usage_limits
  FOR SELECT
  USING (user_id::text = auth.uid()::text);

-- Service role can do everything (for backend operations)
CREATE POLICY "Service role full access on subscriptions" ON subscriptions
  FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access on usage_limits" ON usage_limits
  FOR ALL
  USING (auth.role() = 'service_role');
