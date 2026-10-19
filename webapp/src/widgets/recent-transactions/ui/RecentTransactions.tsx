import type { ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { cn } from '@/shared/lib/utils';
import { ROUTES } from '@/shared/lib/constants/routes';
import { toLocalDate } from '@/shared/lib/dates';
import { SkeletonBlock } from '@/shared/ui/pastel';
import { findCategory, useCategories, type Category } from '@/entities/category';
import { buildRecordDays, RecordDayList, useRecentRecords, type Transaction } from '@/entities/transaction';

/** The board shows the five newest records. */
export const RECENT_LIMIT = 5;

/**
 * What an empty Home says (DoD: after the first launch it tells how to make the first record). The board's
 * sentence starts with «Нажмите кнопку траты внизу» and «скажите, что купили» — the chips and the voice of
 * the bottom composer, which come with FT-114 and FT-117; until then it names what works today: the capture
 * line above the list and a voice message to the bot.
 */
export const FIRST_RECORD_HINT =
  'Пока пусто. Напишите «такси 18к» в строке выше или скажите боту, что купили, — Daftar сам поймёт сумму и категорию.';

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
  onOpen: (id: string) => void;
  onRetry: () => void;
  /** A retry is under way: the button waits instead of firing twice. */
  retrying?: boolean;
}

/** The section as the board draws it, from records already read; `RecentTransactions` reads them. */
export function RecentRecordsView({ records, categories, today, onOpen, onRetry, retrying = false }: RecentRecordsViewProps) {
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
      <RecordDayList days={days} onOpen={onOpen} />
    </Shell>
  );
}

/**
 * «Последние операции» on Home (FT-111, board «Главная», TransactionList.md): the five newest records by
 * day, «Все» opening History. The category's name and colour come from the user's list by id. A row opens
 * the record's screen; the record sheet replaces it in FT-115.
 */
export function RecentTransactions() {
  const navigate = useNavigate();
  const records = useRecentRecords(RECENT_LIMIT);
  const categories = useCategories();

  return (
    <RecentRecordsView
      records={records}
      categories={categories.data}
      today={toLocalDate(new Date())}
      onOpen={(id) => navigate(ROUTES.EDIT_TRANSACTION(id))}
      onRetry={() => void records.refetch()}
      retrying={records.isError && records.isFetching}
    />
  );
}
