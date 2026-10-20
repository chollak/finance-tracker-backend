import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { SearchX } from 'lucide-react';
import { useAccountOperations, useAccounts, visibleAccounts, type MoveOperation } from '@/entities/account';
import { findCategory, useCategories } from '@/entities/category';
import { RecordRowItem } from '@/entities/transaction';
import { openRecordCategory, openRecordSheet, RecordSheet, useRecordFlash } from '@/features/record-sheet';
import { toLocalDate } from '@/shared/lib/dates';
import { useCloseScreen } from '@/shared/lib/navigation';
import { showUndoToast } from '@/shared/lib/undo';
import { cn } from '@/shared/lib/utils';
import { BackButton, ProblemScreen, SkeletonBlock, UndoToast } from '@/shared/ui/pastel';
import { accountDays, accountHeader, type MoveRow, type OperationDay } from '../model/accountScreen';
import { NEEDS_SECOND_ACCOUNT, TRANSFER_NOT_YET } from '../model/notices';
import { CorrectBalanceSheet, EditAccountSheet, MoveSheet } from './AccountSheets';
import { FOCUS, FOCUS_INSET, Icon } from './parts';

/** A transfer, an exchange or an adjustment among the records: a neutral circle, the amount in ink (AccountMoves.md). */
function MoveRowItem({ row, onOpen }: { row: MoveRow; onOpen: () => void }) {
  return (
    <li className="flex items-center rounded-control">
      <button
        type="button"
        onClick={onOpen}
        aria-haspopup="dialog"
        aria-label={row.ariaLabel}
        className={cn('flex min-h-row w-full items-center rounded-control text-left text-ink transition-colors duration-150 active:bg-track', FOCUS_INSET)}
      >
        <span aria-hidden="true" className="flex h-row w-[52px] shrink-0 items-center justify-center pl-1">
          <span className="flex size-10 items-center justify-center rounded-pill bg-track text-ink">
            <Icon name={row.icon} className="size-[18px]" />
          </span>
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-px py-2.5 pl-2 pr-3">
          <span className="type-body-strong truncate">{row.title}</span>
          <span className="truncate text-[13px] leading-snug text-ink-muted">{row.caption}</span>
        </span>
        <span className="shrink-0 whitespace-nowrap pr-2 text-[15px] font-extrabold tabular-nums text-ink">{row.amount}</span>
      </button>
    </li>
  );
}

function OperationDays({
  days,
  onRecord,
  onCategory,
  onMove,
  flashId,
}: {
  days: OperationDay[];
  onRecord: (id: string) => void;
  onCategory: (id: string) => void;
  onMove: (operation: MoveOperation) => void;
  flashId: string | null;
}) {
  return (
    <>
      {days.map((day) => (
        <section key={day.day} aria-label={day.label} className="flex flex-col gap-1.5">
          <h2 className="type-label truncate px-1 font-bold text-ink-muted">{day.label}</h2>
          <ul className="rounded-card bg-card px-2 py-1">
            {day.items.map((item) =>
              item.type === 'record' ? (
                <RecordRowItem key={item.id} row={item.row} onOpen={onRecord} onCategory={onCategory} flashId={flashId} />
              ) : (
                <MoveRowItem key={item.id} row={item.row} onOpen={() => onMove(item.operation)} />
              )
            )}
          </ul>
        </section>
      ))}
    </>
  );
}

function LoadingAccount() {
  return (
    <div className="flex flex-col gap-4" aria-hidden="true">
      <div className="flex flex-col gap-2 rounded-hero bg-card px-5 pb-5 pt-4">
        <SkeletonBlock className="h-3.5 w-24" />
        <SkeletonBlock className="h-10 w-52" radius="tile" />
        <SkeletonBlock className="h-3 w-60" />
        <div className="mt-2 grid grid-cols-2 gap-2">
          <SkeletonBlock className="h-touch" />
          <SkeletonBlock className="h-touch" />
        </div>
      </div>
      <SkeletonBlock className="ml-1 h-3 w-32" />
      <div className="rounded-card bg-card px-2 py-1">
        {[0, 1, 2].map((row) => (
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

type OpenSheet = { kind: 'edit' } | { kind: 'correct' } | { kind: 'move'; operation: MoveOperation } | null;

/**
 * One account (FT-118, boards «Счёт «Карта» · операции», «Обмен · подробнее и удаление», «Сверить остаток»,
 * «Изменить или скрыть счёт»; design-system «Экран счёта»): the balance large, the opening balance with its date,
 * «Перевести» (a dollar account «Обменять») and «Сверить остаток», then its records and moves by day. A record
 * opens the same record sheet as in History; a move opens «Подробнее», where it is deleted with «Отменить».
 * «Изменить» renames, changes the currency while there are no operations, and hides the account.
 */
export function AccountPage() {
  const { id } = useParams();
  const [today] = useState(() => toLocalDate(new Date()));
  const operations = useAccountOperations(id);
  const accounts = useAccounts();
  const categories = useCategories();
  const flashId = useRecordFlash();
  const close = useCloseScreen();
  const [sheet, setSheet] = useState<OpenSheet>(null);
  // Each opening of «Изменить» and «Сверить остаток» starts from the account as it is now
  const [sheetKey, setSheetKey] = useState(0);
  const open = (next: Exclude<OpenSheet, null>) => {
    setSheetKey((key) => key + 1);
    setSheet(next);
  };
  const onOpenChange = (value: boolean) => {
    if (!value) setSheet(null);
  };

  if (operations.error?.statusCode === 404) {
    return (
      <ProblemScreen
        header={<BackButton />}
        icon={<SearchX strokeWidth={1.9} />}
        title="Такого счёта нет"
        text="Возможно, ссылка устарела. Все ваши счета — в списке счетов."
        action={{ label: 'К счетам', onClick: close }}
      />
    );
  }

  const data = operations.data;
  const account = data?.account;
  const visible = visibleAccounts(accounts.data?.accounts);
  const canTransfer = !!account && !account.isHidden && visible.length >= 2;
  const header = account ? accountHeader(account, today) : null;
  const days = data
    ? accountDays(data, { today, categoryOf: (record) => findCategory(categories.data, record.categoryId) })
    : null;
  const recordOf = (recordId: string) =>
    data?.days.flatMap((day) => day.operations).find((operation) => operation.type === 'record' && operation.id === recordId);
  const seed = (recordId: string) => {
    const operation = recordOf(recordId);
    return operation?.type === 'record' ? operation.record : undefined;
  };

  let content;
  if (account && header && days) {
    content = (
      <>
        <section aria-label="Остаток" className="flex flex-col gap-1 rounded-hero bg-card px-5 pb-[18px] pt-4">
          <span className="text-[14px] font-semibold leading-snug text-ink-muted">{header.caption}</span>
          <p className="flex flex-wrap items-baseline gap-x-2">
            <span className="whitespace-nowrap text-[40px] font-bold leading-[1.05] tracking-[-1.4px] tabular-nums">{header.balance}</span>
            <span className="text-[17px] font-semibold text-ink-muted">{header.unit}</span>
          </p>
          <span className="type-label leading-[1.4] text-ink-muted">{header.initialText}</span>
          <div className="mt-2.5 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => showUndoToast({ kind: 'info', ...(canTransfer ? TRANSFER_NOT_YET : NEEDS_SECOND_ACCOUNT) })}
              aria-disabled={!canTransfer || undefined}
              className={cn(
                'min-h-touch rounded-pill bg-track px-3 py-1.5 text-[14px] font-extrabold leading-tight',
                canTransfer ? 'text-ink' : 'text-seg-off',
                FOCUS
              )}
            >
              {header.moveLabel}
            </button>
            <button
              type="button"
              onClick={() => open({ kind: 'correct' })}
              aria-haspopup="dialog"
              className={cn('min-h-touch rounded-pill bg-track px-3 py-1.5 text-[14px] font-extrabold leading-tight text-ink', FOCUS)}
            >
              Сверить остаток
            </button>
          </div>
        </section>

        {days.length > 0 ? (
          <OperationDays
            days={days}
            onRecord={(recordId) => openRecordSheet(recordId, seed(recordId))}
            onCategory={(recordId) => openRecordCategory(recordId, seed(recordId))}
            onMove={(operation) => open({ kind: 'move', operation })}
            flashId={flashId}
          />
        ) : (
          <section className="flex flex-col gap-1 rounded-card bg-card p-5">
            <h2 className="text-[15px] font-extrabold">Операций пока нет</h2>
            <p className="type-label leading-[1.45] text-ink-muted">Здесь появятся расходы, доходы и переводы этого счёта.</p>
          </section>
        )}
      </>
    );
  } else if (operations.isError) {
    content = (
      <div className="flex flex-col items-start gap-1 rounded-card bg-card px-5 pb-2 pt-5">
        <p className="text-[14px] font-medium leading-[1.45] text-ink-muted">Не удалось загрузить счёт.</p>
        <button
          type="button"
          onClick={() => void operations.refetch()}
          disabled={operations.isFetching}
          aria-busy={operations.isFetching}
          className={cn('-ml-3 h-touch rounded-pill px-3 text-[14px] font-extrabold text-ink disabled:text-ink-muted', FOCUS)}
        >
          Попробовать снова
        </button>
      </div>
    );
  } else {
    content = (
      <>
        <LoadingAccount />
        <span className="sr-only" role="status">
          Загружаем счёт…
        </span>
      </>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl pb-8 text-ink">
      <div className="flex flex-col px-4 pt-2">
        <header className="mb-3 flex h-key items-center gap-3">
          <BackButton />
          <h1 className="type-section min-w-0 flex-1 truncate text-ink">{account?.name ?? 'Счёт'}</h1>
          {account && (
            <button
              type="button"
              onClick={() => open({ kind: 'edit' })}
              aria-haspopup="dialog"
              className={cn('h-touch shrink-0 rounded-pill bg-card px-3.5 text-[14px] font-extrabold text-ink', FOCUS)}
            >
              Изменить
            </button>
          )}
        </header>
        <div className="flex flex-col gap-4">{content}</div>
      </div>

      {account && (
        <>
          <EditAccountSheet
            key={`edit-${sheetKey}`}
            open={sheet?.kind === 'edit'}
            onOpenChange={onOpenChange}
            account={account}
            visibleCount={visible.length}
            rateMinor={accounts.data?.rate?.rateMinor ?? null}
            today={today}
            onHidden={close}
          />
          <CorrectBalanceSheet key={`correct-${sheetKey}`} open={sheet?.kind === 'correct'} onOpenChange={onOpenChange} account={account} />
          {sheet?.kind === 'move' && (
            <MoveSheet open onOpenChange={onOpenChange} operation={sheet.operation} account={account} today={today} />
          )}
        </>
      )}

      {/* A row opens the record sheet, as in History; its toasts and the accounts' show at the bottom edge */}
      <RecordSheet />
      <UndoToast bottom={24} />
    </div>
  );
}
