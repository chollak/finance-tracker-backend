import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ApiError } from '@/shared/api';

/**
 * The analytics API refuses a month later than the current one (400): a link, or a device clock ahead. Reading it
 * again cannot succeed, and without an answer there is no month stepper to leave it by, so the screen goes to the
 * current month in its own place (`current` — the same screen without `?month`).
 */
export function useLeaveRefusedMonth(month: string | undefined, error: ApiError | null, current: string): boolean {
  const navigate = useNavigate();
  const refused = month !== undefined && error?.statusCode === 400;
  useEffect(() => {
    if (refused) navigate(current, { replace: true });
  }, [refused, current, navigate]);
  return refused;
}
