-- Migration: Add atomic increment/decrement functions for usage_limits
-- This fixes race conditions when multiple requests try to update counters simultaneously

-- Atomic increment function for usage_limits
CREATE OR REPLACE FUNCTION increment_usage_counter(
  p_user_id UUID,
  p_column_name TEXT
)
RETURNS SETOF usage_limits AS $$
BEGIN
  -- Validate column name to prevent SQL injection
  IF p_column_name NOT IN ('transactions_count', 'voice_inputs_count', 'active_debts_count') THEN
    RAISE EXCEPTION 'Invalid column name: %', p_column_name;
  END IF;

  -- Atomic increment and return updated row
  RETURN QUERY EXECUTE format(
    'UPDATE usage_limits
     SET %I = %I + 1, updated_at = NOW()
     WHERE user_id = $1
     RETURNING *',
    p_column_name, p_column_name
  ) USING p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Atomic decrement function with floor at 0
CREATE OR REPLACE FUNCTION decrement_usage_counter(
  p_user_id UUID,
  p_column_name TEXT
)
RETURNS SETOF usage_limits AS $$
BEGIN
  -- Validate column name to prevent SQL injection
  IF p_column_name NOT IN ('transactions_count', 'voice_inputs_count', 'active_debts_count') THEN
    RAISE EXCEPTION 'Invalid column name: %', p_column_name;
  END IF;

  -- Atomic decrement (floor at 0) and return updated row
  RETURN QUERY EXECUTE format(
    'UPDATE usage_limits
     SET %I = GREATEST(0, %I - 1), updated_at = NOW()
     WHERE user_id = $1
     RETURNING *',
    p_column_name, p_column_name
  ) USING p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions to authenticated users
GRANT EXECUTE ON FUNCTION increment_usage_counter(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION decrement_usage_counter(UUID, TEXT) TO authenticated;

-- Also grant to anon for edge cases
GRANT EXECUTE ON FUNCTION increment_usage_counter(UUID, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION decrement_usage_counter(UUID, TEXT) TO anon;
