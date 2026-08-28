import { formatAmount, heroFontSize } from '../lib/money';
import { WeekBars } from './WeekBars';
import type { DayBar } from '../lib/summary';

const MONTHS = [
  'январе', 'феврале', 'марте', 'апреле', 'мае', 'июне',
  'июле', 'августе', 'сентябре', 'октябре', 'ноябре', 'декабре',
];

/**
 * Единственная доминанта экрана. Всё остальное обязано отступать —
 * иначе получается набор равнозначных блоков, от которого продукт уходит.
 */
export function SummaryCard({ total, days }: { total: number; days: DayBar[] }) {
  // Месяц берётся из UTC-дня: календарный день системы — UTC-день.
  const monthIndex = Number(new Date().toISOString().slice(5, 7)) - 1;

  return (
    <div className="flex flex-col gap-[18px] rounded-[var(--radius-card)] bg-surface p-5 pb-4">
      <div className="flex flex-col gap-[5px]">
        <div className="text-[13.5px] font-medium text-muted">
          Потрачено в {MONTHS[monthIndex]}
        </div>
        <div className="flex items-baseline gap-1.5">
          <div
            className="num font-extrabold leading-[1.05] tracking-[-0.03em]"
            style={{ fontSize: heroFontSize(total) }}
          >
            {formatAmount(total)}
          </div>
          <div className="text-[15px] font-medium text-muted">сум</div>
        </div>
      </div>

      <WeekBars days={days} />
    </div>
  );
}
