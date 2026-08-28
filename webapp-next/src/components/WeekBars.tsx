import type { DayBar } from '../lib/summary';
import { formatAmount } from '../lib/money';

const WEEKDAYS = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];

/** Подпись оси: 6 000 000 съело бы четверть карточки. */
function compact(value: number): string {
  if (value >= 1_000_000) return `${Math.round(value / 1_000_000)}М`;
  if (value >= 1_000) return `${Math.round(value / 1_000)}К`;
  return String(Math.round(value));
}

/** День недели по UTC — календарный день системы UTC-день. */
function weekdayLabel(date: string): string {
  return WEEKDAYS[new Date(`${date}T00:00:00.000Z`).getUTCDay()];
}

export function WeekBars({ days }: { days: DayBar[] }) {
  const max = Math.max(...days.map((d) => d.total), 0);

  // Пустая неделя не рисует ложных столбиков: сетка есть, столбиков нет.
  const scale = (total: number) => (max > 0 ? Math.max((total / max) * 100, total > 0 ? 3 : 0) : 0);

  return (
    <div className="flex flex-col gap-[9px]">
      <div className="flex gap-2.5">
        <div className="relative h-[92px] grow">
          <div className="absolute inset-0 flex flex-col justify-between">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-px bg-line" />
            ))}
          </div>
          <div className="absolute inset-0 flex items-end gap-[9px] px-0.5">
            {days.map((day) => (
              <div
                key={day.date}
                className="grow rounded-[3px] bg-text"
                style={{ height: `${scale(day.total)}%` }}
                title={`${day.date}: ${formatAmount(day.total)}`}
              />
            ))}
          </div>
        </div>

        <div className="num flex h-[92px] w-[34px] shrink-0 flex-col justify-between text-right text-[10.5px] text-faint">
          {[3, 2, 1, 0].map((step) => (
            <div key={step} className="-translate-y-[5px]">
              {max > 0 ? compact((max / 3) * step) : step === 0 ? '0' : ''}
            </div>
          ))}
        </div>
      </div>

      <div className="flex gap-[9px] pr-[44px] text-[11px] font-medium text-faint">
        {days.map((day) => (
          <div key={day.date} className="grow text-center">
            {weekdayLabel(day.date)}
          </div>
        ))}
      </div>
    </div>
  );
}
