import { useEffect, useRef, useState } from 'react';
import { useAccounts, visibleAccounts } from '@/entities/account';
import { findCategory, useCategories } from '@/entities/category';
import { useUsdRate } from '@/entities/rate';
import { buildRecordDays, isHistoryNarrowed, RecordDayList, useRecord, useRecordHistory } from '@/entities/transaction';
import {
  EMPTY_HISTORY,
  HistoryFilters,
  NOTHING_FOUND_TITLE,
  nothingFoundText,
  resultLine,
  useHistoryFilters,
} from '@/features/history-filters';
import { openRecordCategory, openRecordSheet, RecordSheet, useRecordFlash } from '@/features/record-sheet';
import { toLocalDate } from '@/shared/lib/dates';
import { cn } from '@/shared/lib/utils';
import { BackButton, Button, EmptyState, SkeletonBlock, UndoToast } from '@/shared/ui/pastel';
import { withKeptRecord } from '../model/keptRecord';

const FOCUS = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink';

/** Rows still being read: a day label and a card of grey rows (Skeleton.md), no spinner. */
function LoadingRows({ rows = 3 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-1.5" aria-hidden="true">
      <SkeletonBlock className="ml-1 h-3 w-32" />
      <div className="rounded-card bg-card px-2 py-1">
        {Array.from({ length: rows }, (_, row) => (
          <div key={row} className="flex h-row items-center gap-3 pl-1.5 pr-2">
            <SkeletonBlock className="size-10 shrink-0" />
            <div className="flex flex-1 flex-col gap-1.5">
              <SkeletonBlock className="h-3.5 w-24" />
              <SkeletonBlock className="h-3 w-36" />
            </div>
            <SkeletonBlock className="h-3.5 w-16" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** A read failed: says so and reads again (a problem says what to do). */
function ReadFailed({ text, onRetry, retrying }: { text: string; onRetry: () => void; retrying: boolean }) {
  return (
    <div className="flex flex-col items-start gap-1 rounded-card bg-card px-5 pb-2 pt-5">
      <p className="text-[14px] font-medium leading-[1.45] text-ink-muted">{text}</p>
      <button
        type="button"
        onClick={onRetry}
        disabled={retrying}
        aria-busy={retrying}
        className={cn('-ml-3 h-touch rounded-pill px-3 text-[14px] font-extrabold text-ink disabled:text-ink-muted', FOCUS)}
      >
        Попробовать снова
      </button>
    </div>
  );
}

/**
 * The end of the list: reads the next page once it comes near the screen. Without IntersectionObserver a button
 * reads it.
 */
function NextPage({ onLoad }: { onLoad: () => void }) {
  const marker = useRef<HTMLDivElement>(null);
  const load = useRef(onLoad);
  useEffect(() => {
    load.current = onLoad;
  });
  const [watching] = useState(() => typeof IntersectionObserver !== 'undefined');

  useEffect(() => {
    const node = marker.current;
    if (!node || !watching) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) load.current();
    }, { rootMargin: '400px 0px' });
    observer.observe(node);
    return () => observer.disconnect();
  }, [watching]);

  if (!watching) {
    return (
      <button type="button" onClick={onLoad} className={cn('h-touch self-center rounded-pill px-4 text-[14px] font-extrabold text-ink', FOCUS)}>
        Показать ещё
      </button>
    );
  }
  return <div ref={marker} aria-hidden="true" className="h-px" />;
}

const SEARCH_ICON = (
  <svg viewBox="0 0 20 20">
    <circle cx="9" cy="9" r="5.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
    <path d="m13.2 13.2 3.6 3.6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
  </svg>
);

/**
 * History (FT-116, boards «История», «История · «такси» + Наличные», «История · ничего не найдено»): the search and
 * the filter chips stay on top while the records scroll under them, by day, each day with its total in сум. The
 * server searches and filters (GET /api/transactions) and pages by a cursor; the end of the list reads the next
 * page. What a search found is summed up under the chips with «Сбросить»; nothing found says what was searched and
 * resets it all. A row opens its record sheet, its category circle the choice of a category; the record just
 * changed stays in a filtered list until the filter changes. Opened from Home («Все»), «Назад» returns there.
 */
export function TransactionsPage() {
  const filters = useHistoryFilters();
  const { query } = filters;
  const history = useRecordHistory(query);
  const categories = useCategories();
  const accounts = useAccounts();
  const rate = useUsdRate();
  const flashId = useRecordFlash();
  const [today] = useState(() => toLocalDate(new Date()));

  // The record whose row was opened, while the filter it was opened under stays
  const filterKey = `${query.text}\u0000${query.categoryId ?? ''}\u0000${query.accountId ?? ''}`;
  const [kept, setKept] = useState<{ id: string; filterKey: string } | null>(null);
  const keptRecord = useRecord(kept?.filterKey === filterKey ? kept.id : null);

  const pages = history.data?.pages;
  const items = pages ? withKeptRecord(pages.flatMap((page) => page.items), keptRecord.data) : undefined;
  const summary = pages?.[0]?.summary ?? null;
  const allAccounts = accounts.data?.accounts ?? [];
  const accountName = (id: string | undefined) => allAccounts.find((account) => account.id === id)?.name;
  const narrowed = isHistoryNarrowed(query);

  const days = items
    ? buildRecordDays(items, {
        today,
        categoryOf: (record) => findCategory(categories.data, record.categoryId),
        accountOf: (record) => accountName(record.accountId),
        datedLabels: true,
        dayTotals: { rateMinor: rate.data?.effective?.rateMinor ?? null, lastDayComplete: !history.hasNextPage },
      })
    : undefined;

  const seed = (id: string) => items?.find((record) => record.id === id);
  const open = (id: string, view: 'sheet' | 'category') => {
    setKept({ id, filterKey });
    if (view === 'sheet') openRecordSheet(id, seed(id));
    else openRecordCategory(id, seed(id));
  };

  let content;
  if (!days) {
    content = history.isError ? (
      <ReadFailed text="Не удалось загрузить операции." onRetry={() => void history.refetch()} retrying={history.isFetching} />
    ) : (
      <>
        <LoadingRows />
        <LoadingRows rows={2} />
        <span className="sr-only" role="status">
          Загружаем операции…
        </span>
      </>
    );
  } else if (days.length === 0) {
    content = narrowed ? (
      <EmptyState
        icon={SEARCH_ICON}
        title={NOTHING_FOUND_TITLE}
        text={nothingFoundText({
          text: query.text,
          category: findCategory(categories.data, query.categoryId ?? undefined)?.name ?? null,
          account: accountName(query.accountId ?? undefined) ?? null,
        })}
        action={
          <Button onClick={filters.reset} className="mt-2 h-key w-auto px-[22px] text-[15px]">
            Сбросить поиск и фильтры
          </Button>
        }
      />
    ) : (
      <EmptyState icon={SEARCH_ICON} title={EMPTY_HISTORY.title} text={EMPTY_HISTORY.text} />
    );
  } else {
    content = (
      <>
        <RecordDayList
          days={days}
          variant="history"
          onOpen={(id) => open(id, 'sheet')}
          onCategory={(id) => open(id, 'category')}
          flashId={flashId}
        />
        {history.hasNextPage &&
          (history.isFetchNextPageError ? (
            <ReadFailed text="Не удалось загрузить следующие операции." onRetry={() => void history.fetchNextPage()} retrying={history.isFetchingNextPage} />
          ) : history.isFetchingNextPage ? (
            <LoadingRows rows={2} />
          ) : (
            <NextPage onLoad={() => void history.fetchNextPage()} />
          ))}
      </>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl pb-8 text-ink">
      {/* The search and the chips stay on top while the records scroll under them (board «История») */}
      <div className="sticky top-0 z-10 flex flex-col gap-3 bg-bg px-4 pb-2 pt-2">
        <header className="flex h-key items-center gap-3">
          <BackButton />
          <h1 className="type-section text-ink">История</h1>
        </header>
        <HistoryFilters
          filters={filters}
          categories={categories.data}
          accounts={visibleAccounts(allAccounts)}
          result={narrowed && summary && summary.count > 0 ? resultLine(summary) : null}
        />
      </div>

      <div className="flex flex-col gap-4 px-4 pt-2">{content}</div>

      {/* A row opens the record sheet; its «Удалено» and «Категория изменена» show at the bottom edge (Toast.md) */}
      <RecordSheet />
      <UndoToast />
    </div>
  );
}
