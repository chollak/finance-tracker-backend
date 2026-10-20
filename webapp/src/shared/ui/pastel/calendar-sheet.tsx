import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import {
  addDays,
  dayMonth,
  monthGrid,
  monthNavigation,
  monthTitle,
  parseLocalDate,
  shiftMonth,
  WEEKDAYS_SHORT,
  type LocalDate,
} from '@/shared/lib/dates';
import { Sheet } from './sheet';

interface CalendarSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  value: LocalDate;
  /** Today in the user's local time. */
  today: LocalDate;
  onSelect: (date: LocalDate) => void;
  title?: string;
}

/**
 * Date choice (docs/pastel/components/Calendar.md): «Сегодня» and «Вчера» chips, then the month.
 * Selected day — primary circle; today — 1.5px ink ring; future days disabled; 12 months back.
 * Choosing a day closes the sheet.
 */
export function CalendarSheet({ open, onOpenChange, value, today, onSelect, title = 'Дата' }: CalendarSheetProps) {
  const choose = (date: LocalDate) => {
    onSelect(date);
    onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange} title={title}>
      {/* Sheet content mounts on every open, so the month starts at the chosen date each time. */}
      <CalendarContent value={value} today={today} onChoose={choose} />
    </Sheet>
  );
}

function CalendarContent({ value, today, onChoose }: { value: LocalDate; today: LocalDate; onChoose: (date: LocalDate) => void }) {
  const [view, setView] = useState(() => {
    const { year, month } = parseLocalDate(value);
    return { year, month };
  });
  const choose = onChoose;
  const yesterday = addDays(today, -1);
  const { canPrev, canNext } = monthNavigation(view.year, view.month, today);
  const weeks = monthGrid(view.year, view.month, today);

  return (
    <>
      <div className="flex gap-2">
        {[
          { label: 'Сегодня', date: today },
          { label: 'Вчера', date: yesterday },
        ].map((chip) => (
          <button
            key={chip.label}
            type="button"
            onClick={() => choose(chip.date)}
            className={cn(
              'h-touch rounded-pill px-[18px] text-[14px] font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink',
              value === chip.date ? 'bg-primary text-on-primary' : 'bg-sheet-card text-ink'
            )}
          >
            {chip.label}
          </button>
        ))}
      </div>

      {/* The board's month card: 6px between the month, the weekdays and the days; days step by 46px */}
      <div className="flex flex-col gap-1.5 rounded-card bg-sheet-card px-2.5 pb-2.5 pt-1.5">
        <div className="flex items-center justify-between">
          <button
            type="button"
            aria-label="Предыдущий месяц"
            disabled={!canPrev}
            onClick={() => setView(shiftMonth(view.year, view.month, -1))}
            className="flex size-touch items-center justify-center rounded-pill text-ink disabled:opacity-35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink"
          >
            <ChevronLeft className="size-[18px]" strokeWidth={2.2} />
          </button>
          <p className="text-[15px] font-extrabold" aria-live="polite">{monthTitle(view.year, view.month)}</p>
          <button
            type="button"
            aria-label="Следующий месяц"
            disabled={!canNext}
            onClick={() => setView(shiftMonth(view.year, view.month, 1))}
            className="flex size-touch items-center justify-center rounded-pill text-ink disabled:opacity-35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink"
          >
            <ChevronRight className="size-[18px]" strokeWidth={2.2} />
          </button>
        </div>
        <div className="grid grid-cols-7 text-center type-axis leading-4 text-ink-muted" aria-hidden="true">
          {WEEKDAYS_SHORT.map((day) => <span key={day}>{day}</span>)}
        </div>
        <div className="flex flex-col gap-0.5">
          {weeks.map((week, weekIndex) => (
            <div key={weekIndex} className="grid grid-cols-7 justify-items-center">
              {week.map((cell, dayIndex) =>
                cell ? (
                  <button
                    key={cell.date}
                    type="button"
                    aria-label={`${dayMonth(cell.date)} ${view.year}${cell.isToday ? ', сегодня' : ''}`}
                    aria-pressed={cell.date === value}
                    aria-current={cell.isToday ? 'date' : undefined}
                    disabled={cell.isFuture}
                    onClick={() => choose(cell.date)}
                    className={cn(
                      'flex size-11 items-center justify-center rounded-pill text-[15px] font-bold tabular-nums',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink disabled:opacity-35',
                      cell.date === value ? 'bg-primary text-on-primary' : 'text-ink',
                      cell.isToday && cell.date !== value && 'ring-[1.5px] ring-ink'
                    )}
                  >
                    {cell.day}
                  </button>
                ) : (
                  <span key={`pad-${dayIndex}`} />
                )
              )}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
