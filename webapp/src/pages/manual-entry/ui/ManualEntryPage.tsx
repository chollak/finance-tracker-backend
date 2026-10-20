import { useSearchParams } from 'react-router-dom';
import { ManualEntry } from '@/features/manual-entry';
import { ENTRY_TYPE_PARAM } from '@/shared/lib/constants/routes';

/**
 * Manual entry (FT-113, boards «Ручной ввод», «Ручной ввод · тёмная»), at /add. A nested screen: «Назад»
 * is Telegram's BackButton or its own; a saved record shows Home with «Записано» and «Отменить».
 * Replaces the old form at /transactions/add and the desktop «Быстрое добавление» sheet. `?type=income` starts it
 * as an income («Записать доход» of an empty month of analytics, FT-121).
 */
export function ManualEntryPage() {
  const [params] = useSearchParams();
  return <ManualEntry type={params.get(ENTRY_TYPE_PARAM) === 'income' ? 'income' : 'expense'} />;
}
