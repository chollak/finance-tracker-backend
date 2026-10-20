import { useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { SearchX } from 'lucide-react';
import { useAccounts } from '@/entities/account';
import { useCategoryAnalytics, type CategoryAnalytics } from '@/entities/analytics';
import { findCategory, useCategories } from '@/entities/category';
import { buildRecordDays, RecordDayList, useRecord } from '@/entities/transaction';
import { openRecordCategory, openRecordSheet, RecordSheet, useRecordFlash } from '@/features/record-sheet';
import { ANALYTICS_MONTH_PARAM, ROUTES } from '@/shared/lib/constants/routes';
import { useCloseScreen, useScreenParent } from '@/shared/lib/navigation';
import { cn } from '@/shared/lib/utils';
import { BackButton, CategoryDot, ProblemScreen, SkeletonBlock, UndoToast } from '@/shared/ui/pastel';
import {
  categoryPeriodLabel,
  categorySummary,
  dayAfterMove,
  dayChart,
  dayChip,
  listedRecords,
  noOperationsText,
  stepDay,
  tapDay,
} from '../model/categoryScreen';
import { monthParam } from '../model/periodWords';
import { useLeaveRefusedMonth } from '../model/useLeaveRefusedMonth';
import { DayBarsView } from './DayBars';
import { FOCUS, LoadingRows, ReadFailed } from './parts';

/** Where the category's «Назад» leads when it was opened directly: its own month and side of the overview. */
function overviewOf(data: CategoryAnalytics | undefined, month: string | undefined): string {
  if (!data) return ROUTES.ANALYTICS_VIEW({ month });
  return ROUTES.ANALYTICS_VIEW({ month: data.month === data.currentMonth ? undefined : data.month, type: data.category.type });
}

/** The record whose row or circle was opened here, and its day as last seen (the chosen day follows its moves). */
interface Kept {
  id: string;
  /** The category and the month it was opened on: another one forgets it. */
  screen: string;
  day: string | null;
}

/** The total and the bars while the category is read (Skeleton.md). */
function LoadingCategory() {
  return (
    <div className="flex flex-col gap-3" aria-busy="true">
      <div className="flex flex-col gap-2.5 rounded-card bg-card px-5 pb-5 pt-4" aria-hidden="true">
        <SkeletonBlock radius="tile" className="h-8 w-44" />
        <SkeletonBlock className="h-3 w-56" />
        <SkeletonBlock className="h-3 w-48" />
      </div>
      <SkeletonBlock radius="card" className="h-[216px] w-full" />
      <LoadingRows rows={3} />
      <span className="sr-only" role="status">
        Загружаю категорию…
      </span>
    </div>
  );
}

/**
 * A category of the month (FT-121, board «Аналитика · категория «Кафе»»), from `GET /api/analytics/categories/:id`
 * (FT-120): its total — share, count, average, the comparison and the insight about it — then spending by day
 * (DayBars.md) and its operations by day. A chosen day narrows the operations, its chip «5 октября ✕» clears it. An
 * operation opens its record sheet, its circle the choice of a category; a change refetches the numbers.
 *
 * The record opened or changed here stays in the list as it is now (board: `keepId`) while the screen shows the same
 * category and month — moved to another category, its row names it; moved to another day of the month, the chosen
 * day goes with it; moved out of the month, it leaves, and the sheet says «Дата изменена» with «Отменить» as it
 * closes. Opened directly, «Назад» leads to the overview of its own month and side.
 */
export function CategoryAnalyticsPage() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const month = monthParam(params.get(ANALYTICS_MONTH_PARAM));
  const analytics = useCategoryAnalytics(id, month);
  const categories = useCategories();
  const accounts = useAccounts();
  const flashId = useRecordFlash();
  const close = useCloseScreen();
  const [selected, setSelected] = useState<string | null>(null);
  const data = analytics.data;
  useScreenParent(overviewOf(data, month));
  const refusedMonth = useLeaveRefusedMonth(month, analytics.error, ROUTES.ANALYTICS_CATEGORY(id ?? ''));

  // The record kept in the list, as the record sheet last read or saved it (a deleted one is not asked for again)
  const screen = `${id ?? ''}|${month ?? ''}`;
  const [kept, setKept] = useState<Kept | null>(null);
  if (kept && kept.screen !== screen) setKept(null);
  const keptId = kept?.screen === screen ? kept.id : null;
  const keptRecord = useRecord(keptId, undefined, { cachedOnly: true }).data;
  const keptDay = keptRecord ? keptRecord.date.slice(0, 10) : null;
  if (kept && keptId && keptDay && keptDay !== kept.day) {
    setKept({ ...kept, day: keptDay });
    if (kept.day && data) setSelected(dayAfterMove(data, selected, kept.day, keptDay));
  }


  if (analytics.error?.statusCode === 404) {
    return (
      <ProblemScreen
        header={<BackButton label="Ко всем категориям" />}
        icon={<SearchX strokeWidth={1.9} />}
        title="Такой категории нет"
        text="Возможно, ссылка устарела. Все категории месяца — в аналитике."
        action={{ label: 'К аналитике', onClick: close }}
      />
    );
  }

  const own = findCategory(categories.data, id);
  const name = own?.name ?? data?.category.name ?? '';
  const accountName = (accountId: string | undefined) => accounts.data?.accounts.find((account) => account.id === accountId)?.name;

  let content;
  if (!data) {
    content = analytics.isError && !refusedMonth ? (
      <ReadFailed text="Не удалось загрузить категорию." onRetry={() => void analytics.refetch()} retrying={analytics.isFetching} />
    ) : (
      <LoadingCategory />
    );
  } else {
    const summary = categorySummary(data);
    const chart = dayChart(data, selected);
    const dates = chart?.columns.map((column) => column.date) ?? [];
    const listed = listedRecords(data, keptRecord);
    const shown = listed.filter((record) => !selected || record.date.slice(0, 10) === selected);
    const days = buildRecordDays(shown, {
      today: data.today,
      categoryOf: (record) => findCategory(categories.data, record.categoryId),
      accountOf: (record) => accountName(record.accountId),
      datedLabels: true,
      dayTotals: { rateMinor: data.usd.rateMinor, lastDayComplete: true },
      lead: { categoryId: data.category.id },
    });
    const open = (recordId: string, view: 'sheet' | 'category') => {
      const seed = listed.find((record) => record.id === recordId);
      setKept({ id: recordId, screen, day: seed ? seed.date.slice(0, 10) : null });
      if (view === 'sheet') openRecordSheet(recordId, seed);
      else openRecordCategory(recordId, seed);
    };

    content = (
      <>
        <section aria-label="Итог по категории" className="flex flex-col gap-1.5 rounded-card bg-card px-5 pb-5 pt-4">
          <p className="flex items-baseline gap-2">
            <span className={cn('type-amount-card whitespace-nowrap', summary.tone === 'income' ? 'text-income' : 'text-ink')}>{summary.amount}</span>{' '}
            <span className="text-[16px] font-bold text-ink-muted">сум</span>
          </p>
          <span className="type-label text-ink-muted">{summary.meta}</span>
          {summary.compare && <span className="type-label text-ink-muted">{summary.compare}</span>}
          {summary.insight && <p className="mt-2 border-t border-line pt-2.5 text-[15px] font-bold leading-[1.4]">{summary.insight}</p>}
        </section>

        {chart && (
          <DayBarsView
            chart={chart}
            onTap={(fraction) => setSelected(tapDay(dates, selected, fraction, chart.largest))}
            onStep={(direction) => setSelected(stepDay(dates, selected, direction))}
          />
        )}

        <section aria-label="Операции" className="flex flex-col gap-2.5">
          <div className="flex items-center justify-between gap-2 px-1 pt-1">
            <h2 className="type-section">Операции</h2>
            {selected && (
              <button
                type="button"
                onClick={() => setSelected(null)}
                aria-label={`Сбросить день: ${dayChip(selected)}`}
                className={cn('-mr-1 flex h-touch items-center gap-1.5 rounded-pill bg-primary px-3 text-[13px] font-extrabold text-on-primary', FOCUS)}
              >
                {dayChip(selected)}
                <svg width="14" height="14" viewBox="0 0 20 20" aria-hidden="true">
                  <path d="M5.5 5.5l9 9m0-9-9 9" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
                </svg>
              </button>
            )}
          </div>
          {days.length > 0 ? (
            <RecordDayList
              days={days}
              variant="category"
              onOpen={(recordId) => open(recordId, 'sheet')}
              onCategory={(recordId) => open(recordId, 'category')}
              flashId={flashId}
            />
          ) : (
            <p className="rounded-card bg-card p-5 text-[14px] font-medium text-ink-muted">{noOperationsText(data, selected)}</p>
          )}
        </section>
      </>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl pb-24 text-ink">
      <div className="sticky top-0 z-10 bg-bg px-4 pb-2 pt-2">
        <header className="flex h-key items-center gap-3">
          <BackButton label="Ко всем категориям" />
          {name && <CategoryDot name={name} color={own?.color ?? 'mist'} className="size-8 text-[13px]" />}
          <h1 className="type-section min-w-0 flex-1 truncate">{name}</h1>
          {data && <span className="type-label shrink-0 text-ink-muted">{categoryPeriodLabel(data)}</span>}
        </header>
      </div>

      <div className="flex flex-col gap-3 px-4 pt-1">{content}</div>

      {/* An operation opens its sheet; «Удалено», «Категория изменена» and «Дата изменена» show at the bottom edge
          (Toast.md). The screen lists its period only: a record moved out of it says so */}
      <RecordSheet period={data?.period} />
      <UndoToast />
    </div>
  );
}
