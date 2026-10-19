import { ManualEntry } from '@/features/manual-entry';

/**
 * Manual entry (FT-113, boards «Ручной ввод», «Ручной ввод · тёмная»), at /add. A nested screen: «Назад»
 * is Telegram's BackButton or its own; a saved record shows Home with «Записано» and «Отменить».
 * Replaces the old form at /transactions/add and the desktop «Быстрое добавление» sheet.
 */
export function ManualEntryPage() {
  return <ManualEntry />;
}
