import { format, formatDistanceToNow, isToday, isYesterday, parseISO } from 'date-fns';
import { ru } from 'date-fns/locale';

const LOCALE = ru;

/**
 * Formats date string to localized format
 * @param dateString - ISO date string
 * @param formatPattern - date-fns format pattern (default: 'd MMMM yyyy')
 * @returns Formatted date string (e.g., "14 января 2025")
 */
export function formatDate(
  dateString: string | Date,
  formatPattern: string = 'd MMMM yyyy'
): string {
  const date = typeof dateString === 'string' ? parseISO(dateString) : dateString;
  return format(date, formatPattern, { locale: LOCALE });
}

/**
 * Formats date in short format
 * @param dateString - ISO date string
 * @returns Formatted date string (e.g., "14.01.2025")
 */
export function formatDateShort(dateString: string | Date): string {
  return formatDate(dateString, 'dd.MM.yyyy');
}

/**
 * Formats date with time
 * @param dateString - ISO date string
 * @returns Formatted date string (e.g., "14 января 2025, 15:30")
 */
export function formatDateTime(dateString: string | Date): string {
  return formatDate(dateString, 'd MMMM yyyy, HH:mm');
}

/**
 * Formats date in relative format (e.g., "Today", "Yesterday", "3 days ago")
 * @param dateString - ISO date string
 * @returns Relative date string
 */
export function formatRelativeDate(dateString: string | Date): string {
  const date = typeof dateString === 'string' ? parseISO(dateString) : dateString;

  if (isToday(date)) {
    return 'Сегодня';
  }

  if (isYesterday(date)) {
    return 'Вчера';
  }

  // For dates within last 7 days, show relative time
  const daysDiff = Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24));
  if (daysDiff < 7 && daysDiff > 0) {
    return formatDistanceToNow(date, { addSuffix: true, locale: LOCALE });
  }

  // For older dates, show full date
  return formatDate(date, 'd MMM');
}

/**
 * Formats date for transaction display
 * @param dateString - ISO date string
 * @returns Formatted date with time (e.g., "Сегодня, 15:30" or "14 янв, 15:30")
 */
export function formatTransactionDate(dateString: string | Date): string {
  const date = typeof dateString === 'string' ? parseISO(dateString) : dateString;

  if (isToday(date)) {
    return `Сегодня, ${format(date, 'HH:mm')}`;
  }

  if (isYesterday(date)) {
    return `Вчера, ${format(date, 'HH:mm')}`;
  }

  return formatDate(date, 'd MMM, HH:mm');
}

/**
 * Formats month and year
 * @param dateString - ISO date string
 * @returns Formatted month and year (e.g., "Январь 2025")
 */
export function formatMonthYear(dateString: string | Date): string {
  return formatDate(dateString, 'LLLL yyyy');
}

/**
 * Gets month name
 * @param monthIndex - Month index (0-11)
 * @returns Month name (e.g., "Январь")
 */
export function getMonthName(monthIndex: number): string {
  const date = new Date(2025, monthIndex, 1);
  return format(date, 'LLLL', { locale: LOCALE });
}
