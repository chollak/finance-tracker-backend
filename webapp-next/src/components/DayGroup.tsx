import type { DayGroup as Group } from '../lib/summary';
import type { Transaction } from '../types/transaction';
import { todayUtc, shiftDay } from '../lib/dates';
import { TransactionRow } from './TransactionRow';

const MONTHS_GEN = [
  'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
];

/** Заголовок дня. «Сегодня» и «Вчера» — по UTC, как и всё остальное. */
function dayTitle(date: string): string {
  const today = todayUtc();
  if (date === today) return 'Сегодня';
  if (date === shiftDay(today, -1)) return 'Вчера';

  const [, month, day] = date.split('-');
  return `${Number(day)} ${MONTHS_GEN[Number(month) - 1]}`;
}

export function DayGroup({
  group,
  onSelect,
}: {
  group: Group;
  onSelect?: (tx: Transaction) => void;
}) {
  return (
    <div className="flex flex-col gap-[9px]">
      <div className="pl-1 text-[14px] font-medium text-muted">{dayTitle(group.date)}</div>

      <div className="rounded-[var(--radius-group)] bg-surface px-3.5 py-1">
        {group.items.map((tx, i) => (
          <div key={tx.id}>
            {i > 0 && <div className="ml-[50px] h-px bg-line" />}
            <TransactionRow transaction={tx} onSelect={onSelect} />
          </div>
        ))}
      </div>
    </div>
  );
}
