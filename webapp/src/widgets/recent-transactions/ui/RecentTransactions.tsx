import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { cn } from '@/shared/lib/utils';
import { ROUTES } from '@/shared/lib/constants/routes';
import { toLocalDate } from '@/shared/lib/dates';
import { SkeletonBlock } from '@/shared/ui/pastel';
import { findCategory, useCategories, type Category } from '@/entities/category';
import {
  buildRecordDays,
  RecordDayList,
  usePendingRecords,
  useRecentRecords,
  withPendingRecords,
  type Transaction,
} from '@/entities/transaction';
import { openRecordCategory, openRecordSheet, useRecordFlash } from '@/features/record-sheet';
import { showUndoToast } from '@/shared/lib/undo';

/** The board shows the five newest records. */
export const RECENT_LIMIT = 5;

/**
 * What an empty Home says (DoD: after the first launch it tells how to make the first record). The board's
 * sentence names the composer's chips and voice; voice in the mini app comes with FT-117, so until then it
 * names what works here: the chips at the bottom and the field.
 */
export const FIRST_RECORD_HINT =
  'Пока пусто. Нажмите кнопку траты внизу или напишите «такси 18к» — Kapelka сама поймёт сумму и категорию.';

function Shell({ children }: { children: ReactNode }) {
  return (
    <section aria-label="Последние операции" className="flex flex-col gap-2.5 pt-1">
      <div className="flex items-center justify-between gap-2">
        <h2 className="type-section text-ink">Последние операции</h2>
        {/* With no bottom bar this is the way to History — while loading and on an empty Home too (FT-110) */}
        <Link
          to={ROUTES.TRANSACTIONS}
          aria-label="Все операции"
          className={cn(
            '-mr-2.5 flex h-touch items-center gap-0.5 rounded-pill px-2.5 text-[14px] font-extrabold text-ink',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink'
          )}
        >
          Все
          <svg width="16" height="16" viewBox="0 0 20 20" aria-hidden="true">
            <path d="M7.5 4.5 13 10l-5.5 5.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </Link>
      </div>
      {children}
    </section>
  );
}

function LoadingRows() {
  return (
    <div className="flex flex-col gap-1.5">
      <SkeletonBlock className="h-3 w-16" />
      <div className="rounded-card bg-card px-2 py-1">
        {[0, 1, 2].map((row) => (
          <div key={row} className="flex h-row items-center gap-3 pl-1.5 pr-2">
            <SkeletonBlock className="size-10 shrink-0" />
            <div className="flex flex-1 flex-col gap-1.5">
              <SkeletonBlock className="h-3.5 w-24" />
              <SkeletonBlock className="h-3 w-16" />
            </div>
            <SkeletonBlock className="h-3.5 w-16" />
          </div>
        ))}
      </div>
      <span className="sr-only">Загружаем последние операции…</span>
    </div>
  );
}

function Note({ children }: { children: ReactNode }) {
  return <p className="rounded-card bg-card p-5 text-[14px] font-medium leading-[1.45] text-ink-muted">{children}</p>;
}

/** The records did not load: says so and reads them again (a problem says what to do; FT-112 adds the slow state). */
function LoadFailed({ onRetry, retrying }: { onRetry: () => void; retrying: boolean }) {
  return (
    <div className="flex flex-col items-start gap-1 rounded-card bg-card px-5 pb-2 pt-5">
      <p className="text-[14px] font-medium leading-[1.45] text-ink-muted">Не удалось загрузить записи.</p>
      <button
        type="button"
        onClick={onRetry}
        disabled={retrying}
        aria-busy={retrying}
        className={cn(
          '-ml-3 h-touch rounded-pill px-3 text-[14px] font-extrabold text-ink disabled:text-ink-muted',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink'
        )}
      >
        Попробовать снова
      </button>
    </div>
  );
}

export interface RecentRecordsViewProps {
  records: { data: Transaction[] | undefined; isError: boolean };
  categories: readonly Category[] | undefined;
  today: string;
  /** A row: the record's sheet. */
  onOpen: (id: string) => void;
  /** A row's category circle: the choice of a category at once (FT-115). */
  onCategory?: (id: string) => void;
  /** The row just changed, ringed for 2 seconds. */
  flashId?: string | null;
  onRetry: () => void;
  /** A retry is under way: the button waits instead of firing twice. */
  retrying?: boolean;
}

/** The section as the board draws it, from records already read; `RecentTransactions` reads them. */
export function RecentRecordsView({
  records,
  categories,
  today,
  onOpen,
  onCategory,
  flashId,
  onRetry,
  retrying = false,
}: RecentRecordsViewProps) {
  if (!records.data) {
    return <Shell>{records.isError ? <LoadFailed onRetry={onRetry} retrying={retrying} /> : <LoadingRows />}</Shell>;
  }
  if (records.data.length === 0) {
    return (
      <Shell>
        <Note>{FIRST_RECORD_HINT}</Note>
      </Shell>
    );
  }

  const days = buildRecordDays(records.data, {
    today,
    categoryOf: (record) => findCategory(categories, record.categoryId),
  });
  return (
    <Shell>
      <RecordDayList days={days} onOpen={onOpen} onCategory={onCategory} flashId={flashId} />
    </Shell>
  );
}

/** A tap on a record that waits for the connection (FT-129): it can be changed once it is sent. */
const PENDING_TAP = { title: 'Запись ждёт связи', detail: 'Изменить её можно, когда она отправится' };

/**
 * «Последние операции» on Home (FT-111, board «Главная», TransactionList.md): the five newest records by
 * day, «Все» opening History. The category's name and colour come from the user's list by id. A row opens
 * the record sheet, its category circle the choice of a category, and the row just changed is ringed
 * (FT-115); the screen mounts `RecordSheet`. Records written without a connection are among them with «Ждёт связи»
 * and have no sheet until they are sent (FT-129).
 */
export function RecentTransactions() {
  const records = useRecentRecords(RECENT_LIMIT);
  const pending = usePendingRecords();
  const categories = useCategories();
  const flashId = useRecordFlash();
  // The records written without a connection are among them at once, first on their day (FT-129)
  const listed = withPendingRecords(records.data, pending, RECENT_LIMIT);
  const waiting = new Set(pending.map((record) => record.id));
  // The record as the list has it, shown in the sheet until the sheet reads it
  const seed = (id: string) => records.data?.find((record) => record.id === id);
  // A waiting record is not on the server yet: it has no sheet
  const open = (show: (id: string, seed?: Transaction) => void) => (id: string) => {
    if (waiting.has(id)) {
      showUndoToast({ kind: 'info', title: PENDING_TAP.title, detail: PENDING_TAP.detail });
      return;
    }
    show(id, seed(id));
  };

  return (
    <RecentRecordsView
      records={{ data: listed, isError: records.isError }}
      categories={categories.data}
      today={toLocalDate(new Date())}
      onOpen={open(openRecordSheet)}
      onCategory={open(openRecordCategory)}
      flashId={flashId}
      onRetry={() => void records.refetch()}
      retrying={records.isError && records.isFetching}
    />
  );
}
