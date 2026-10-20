import { useState } from 'react';
import { useMonthAnalytics } from '@/entities/analytics';
import { useCategories, type CategoryType } from '@/entities/category';
import { cn } from '@/shared/lib/utils';
import { BackButton, CategoryDot, Segmented, SkeletonBlock, UndoToast } from '@/shared/ui/pastel';
import { categoryRows, LIST_NOTE, monthCounts, TYPE_OPTIONS, type CategoryRowView } from '../model/categoriesScreen';
import { EditCategorySheet, HiddenCategoriesSheet, NewCategorySheet } from './CategorySheets';

const FOCUS_INSET = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ink';

function Chevron() {
  return (
    <svg width="16" height="16" viewBox="0 0 20 20" aria-hidden="true" className="shrink-0">
      <path d="M7.5 4.5 13 10l-5.5 5.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" aria-hidden="true">
      <path d="M10 4v12M4 10h12" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

const rowClass = 'flex w-full items-center gap-3 py-2 pl-3 pr-3.5 text-left text-ink active:bg-track';

/** One category: its circle, its name and its records this month; a press opens its sheet. */
function CategoryRow({ row, countsLoading, onOpen }: { row: CategoryRowView; countsLoading: boolean; onOpen: () => void }) {
  return (
    <button type="button" onClick={onOpen} aria-haspopup="dialog" aria-label={row.ariaLabel} className={cn(rowClass, 'min-h-row', FOCUS_INSET)}>
      <CategoryDot name={row.name} color={row.color} />
      <span data-row-text="" className="flex min-w-0 flex-1 flex-col gap-px">
        <span className="truncate text-[15px] font-bold leading-snug">{row.name}</span>
        {row.caption ? (
          <span className="text-[13px] font-semibold leading-[1.35] text-ink-muted">{row.caption}</span>
        ) : (
          // The month's records are read apart from the list: until then a grey line in their place (Skeleton.md)
          countsLoading && <SkeletonBlock className="my-[3px] h-3 w-32" />
        )}
      </span>
      <Chevron />
    </button>
  );
}

/** The same shapes while the categories are read (Skeleton.md): eight rows and «Добавить категорию». */
function LoadingList() {
  return (
    <div aria-hidden="true" className="flex flex-col rounded-card bg-card py-1 [&>*+*]:border-t [&>*+*]:border-line">
      {Array.from({ length: 8 }, (_, index) => (
        <div key={index} className="flex h-row items-center gap-3 pl-3 pr-3.5">
          <SkeletonBlock className="size-10 shrink-0" />
          <div className="flex flex-1 flex-col gap-1.5">
            <SkeletonBlock className="h-3.5 w-24" />
            <SkeletonBlock className="h-3 w-32" />
          </div>
        </div>
      ))}
    </div>
  );
}

type OpenSheet = { kind: 'edit'; id: string } | { kind: 'new' } | { kind: 'hidden' } | null;

/**
 * «Категории» (FT-127, boards «Категории», «Категория «Кафе»», «Новая категория», «Скрытые категории», «Категории ·
 * тёмная», «Категории в браузере»): «Расходы / Доходы», the visible categories of the side with their records this
 * month — counted as analytics counts them — «Другое» last, «Добавить категорию» and «Скрытые · N». A category opens
 * its sheet: rename, one of 8 colours, hide — applied when the sheet closes, with a toast and «Отменить». Opened from
 * «Ещё», which «Назад» returns to; inside Telegram its BackButton does.
 */
export function CategoriesPage() {
  const categories = useCategories();
  // Both sides at once, so «Доходы» shows its numbers without waiting
  const expenseMonth = useMonthAnalytics({ month: undefined, type: 'expense' });
  const incomeMonth = useMonthAnalytics({ month: undefined, type: 'income' });
  const [type, setType] = useState<CategoryType>('expense');
  const [sheet, setSheet] = useState<OpenSheet>(null);
  // Every opening of a sheet starts afresh
  const [opening, setOpening] = useState(0);

  const month = type === 'expense' ? expenseMonth : incomeMonth;
  const counts = monthCounts(month.data);
  const countsLoading = !counts && month.isPending && !month.isError;
  const list = categories.data;
  const view = list ? categoryRows(list, type, counts) : null;
  const open = (next: Exclude<OpenSheet, null>) => {
    setOpening((value) => value + 1);
    setSheet(next);
  };
  const close = () => setSheet(null);
  const editing = sheet?.kind === 'edit' ? list?.find((category) => category.id === sheet.id) : undefined;

  let content;
  if (view) {
    content = (
      <>
        <section aria-label={view.listLabel} className="flex flex-col rounded-card bg-card py-1 [&>*+*]:border-t [&>*+*]:border-line">
          {view.visible.map((row) => (
            <CategoryRow key={row.id} row={row} countsLoading={countsLoading} onOpen={() => open({ kind: 'edit', id: row.id })} />
          ))}
          <button type="button" onClick={() => open({ kind: 'new' })} aria-haspopup="dialog" className={cn(rowClass, 'min-h-14 text-[15px] font-extrabold', FOCUS_INSET)}>
            <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-pill border-2 border-dashed border-ink-muted">
              <PlusIcon />
            </span>
            Добавить категорию
          </button>
          {view.hiddenLabel && (
            <button
              type="button"
              onClick={() => open({ kind: 'hidden' })}
              aria-haspopup="dialog"
              className={cn(rowClass, 'min-h-[52px] justify-between px-4 text-[15px] font-bold', FOCUS_INSET)}
            >
              {view.hiddenLabel}
              <Chevron />
            </button>
          )}
        </section>
        <p className="mx-1 text-[13px] font-semibold leading-[1.45] text-ink-muted">{LIST_NOTE}</p>
      </>
    );
  } else if (categories.isError) {
    content = (
      <div className="flex flex-col items-start gap-1 rounded-card bg-card px-5 pb-2 pt-5">
        <p className="text-[14px] font-medium leading-[1.45] text-ink-muted">Не удалось загрузить категории.</p>
        <button
          type="button"
          onClick={() => void categories.refetch()}
          disabled={categories.isFetching}
          aria-busy={categories.isFetching}
          className="-ml-3 h-touch rounded-pill px-3 text-[14px] font-extrabold text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink disabled:text-ink-muted"
        >
          Попробовать снова
        </button>
      </div>
    );
  } else {
    content = (
      <>
        <LoadingList />
        <span className="sr-only" role="status">
          Загружаем категории…
        </span>
      </>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl text-ink">
      {/* The header and the switch stay; the list scrolls under them, as on the board */}
      <div className="sticky top-0 z-10 flex flex-col gap-3 bg-bg px-4 py-2">
        <header className="flex h-key items-center gap-3">
          <BackButton label="Назад в «Ещё»" />
          <h1 className="type-section text-ink">Категории</h1>
        </header>
        <Segmented options={TYPE_OPTIONS} value={type} onChange={setType} ariaLabel="Какие категории показать" />
      </div>

      <div className="flex flex-col gap-3 px-4 pb-[calc(32px+env(safe-area-inset-bottom))] pt-1">{content}</div>

      {list && editing && (
        <EditCategorySheet key={`edit-${opening}`} category={editing} categories={list} counts={counts} onClose={close} />
      )}
      {list && sheet?.kind === 'new' && <NewCategorySheet key={`new-${opening}`} type={type} categories={list} onClose={close} />}
      {list && view && sheet?.kind === 'hidden' && (
        <HiddenCategoriesSheet key={`hidden-${opening}`} rows={view.hidden} categories={list} onClose={close} />
      )}

      {/* «Категория изменена», «Категория добавлена», «Категория скрыта» — 24px over the edge, as on the board */}
      <UndoToast bottom={24} />
    </div>
  );
}
