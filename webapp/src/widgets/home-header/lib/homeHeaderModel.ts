import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import type { UserType } from '@/entities/user/model/store';

export interface HomeHeaderDate {
  /** Day and month, e.g. "3 сентября" */
  day: string;
  /** Weekday, e.g. "среда" */
  weekday: string;
}

export function formatHomeHeaderDate(date: Date): HomeHeaderDate {
  return {
    day: format(date, 'd MMMM', { locale: ru }),
    weekday: format(date, 'EEEE', { locale: ru }),
  };
}

export type CaptureChannelTone = 'connected' | 'local' | 'unknown';

export interface CaptureChannelStatus {
  label: string;
  tone: CaptureChannelTone;
}

/**
 * Where a quick capture ends up, derived from the current account mode.
 *
 * Deliberately describes only what the client actually knows (which account the
 * capture is attributed to) — it is not a server/health indicator.
 */
export function getCaptureChannelStatus(userType: UserType): CaptureChannelStatus {
  if (userType === 'telegram') {
    return { label: 'Telegram', tone: 'connected' };
  }

  if (userType === 'guest') {
    return { label: 'Гость', tone: 'local' };
  }

  return { label: 'Нет входа', tone: 'unknown' };
}
