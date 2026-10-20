import { useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { SearchX } from 'lucide-react';
import { useAccounts } from '@/entities/account';
import { useCategoryAnalytics } from '@/entities/analytics';
import { findCategory, useCategories } from '@/entities/category';
import { buildRecordDays, RecordDayList } from '@/entities/transaction';
import { useIsGuest } from '@/entities/user';
import { openRecordCategory, openRecordSheet, RecordSheet, useRecordFlash } from '@/features/record-sheet';
import { ANALYTICS_MONTH_PARAM } from '@/shared/lib/constants/routes';
import { useCloseScreen } from '@/shared/lib/navigation';
import { cn } from '@/shared/lib/utils';
import { BackButton, CategoryDot, ProblemScreen, SkeletonBlock, UndoToast } from '@/shared/ui/pastel';
import {
  categoryPeriodLabel,
  categorySummary,
  dayChart,
  dayChip,
  noOperationsText,
  stepDay,
  tapDay,
} from '../model/categoryScreen';
import { monthParam } from '../model/periodWords';
import { DayBarsView } from './DayBars';
import { FOCUS, GuestAnalytics, LoadingRows, ReadFailed } from './parts';

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
 */
export function CategoryAnalyticsPage() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const month = monthParam(params.get(ANALYTICS_MONTH_PARAM));
  const isGuest = useIsGuest();
  const analytics = useCategoryAnalytics(id, month);
  const categories = useCategories();
  const accounts = useAccounts();
  const flashId = useRecordFlash();
  const close = useCloseScreen();
  const [selected, setSelected] = useState<string | null>(null);

  if (isGuest) return <GuestAnalytics />;

  if (analytics.error?.statusCode === 404) {
    return (
      <ProblemScreen
        header={<BackButton />}
        icon={<SearchX strokeWidth={1.9} />}
        title="Такой категории нет"
        text="Возможно, ссылка устарела. Все категории месяца — в аналитике."
        action={{ label: 'К аналитике', onClick: close }}
      />
    );
  }

  const data = analytics.data;
  const own = findCategory(categories.data, id);
  const name = own?.name ?? data?.category.name ?? '';
  const accountName = (accountId: string | undefined) => accounts.data?.accounts.find((account) => account.id === accountId)?.name;

  let content;
  if (!data) {
    content = analytics.isError ? (
      <ReadFailed text="Не удалось загрузить категорию." onRetry={() => void analytics.refetch()} retrying={analytics.isFetching} />
    ) : (
      <LoadingCategory />
    );
  } else {
    const summary = categorySummary(data);
    const chart = dayChart(data, selected);
    const dates = chart?.columns.map((column) => column.date) ?? [];
    const shown = data.records.filter((record) => !selected || record.date.slice(0, 10) === selected);
    const days = buildRecordDays(shown, {
      today: data.today,
      categoryOf: (record) => findCategory(categories.data, record.categoryId),
      accountOf: (record) => accountName(record.accountId),
      datedLabels: true,
      dayTotals: { rateMinor: data.usd.rateMinor, lastDayComplete: true },
      lead: { categoryId: data.category.id },
    });
    const seed = (recordId: string) => data.records.find((record) => record.id === recordId);

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
              onOpen={(recordId) => openRecordSheet(recordId, seed(recordId))}
              onCategory={(recordId) => openRecordCategory(recordId, seed(recordId))}
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
          <BackButton />
          {name && <CategoryDot name={name} color={own?.color ?? 'mist'} className="size-8 text-[13px]" />}
          <h1 className="type-section min-w-0 flex-1 truncate">{name}</h1>
          {data && <span className="type-label shrink-0 text-ink-muted">{categoryPeriodLabel(data)}</span>}
        </header>
      </div>

      <div className="flex flex-col gap-3 px-4 pt-1">{content}</div>

      {/* An operation opens its sheet; «Удалено» and «Категория изменена» show at the bottom edge (Toast.md) */}
      <RecordSheet />
      <UndoToast />
    </div>
  );
}
