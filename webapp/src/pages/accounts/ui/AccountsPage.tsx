import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAccounts } from '@/entities/account';
import { useUsdRate } from '@/entities/rate';
import { useIsOnline } from '@/shared/hooks';
import { ROUTES } from '@/shared/lib/constants/routes';
import { toLocalDate } from '@/shared/lib/dates';
import { cn } from '@/shared/lib/utils';
import { BackButton, Button, SkeletonBlock, UndoToast } from '@/shared/ui/pastel';
import { accountsListModel, type AccountsListModel } from '../model/accountsList';
import { knownRates, rateRowModel, type RateRowModel } from '../model/rateRow';
import { HiddenAccountsSheet, NewAccountSheet, RateSheet } from './ListSheets';
import { AccountMark, FOCUS, FOCUS_INSET, Icon } from './parts';

function TotalCard({ model }: { model: AccountsListModel }) {
  return (
    <section aria-label="Всего на счетах" className="flex flex-col gap-1 rounded-hero bg-primary px-5 pb-[18px] pt-4 text-on-primary">
      <h2 className="text-[14px] font-semibold leading-snug text-on-primary-muted">Всего на счетах</h2>
      <p className="flex min-w-0 items-baseline gap-2">
        <span className="whitespace-nowrap text-[40px] font-bold leading-[1.05] tracking-[-1.4px] tabular-nums">{model.total}</span>
        <span className="text-[17px] font-semibold text-on-primary-muted">сум</span>
      </p>
      <span className="type-label leading-[1.4] text-on-primary-muted">{model.totalNote}</span>
    </section>
  );
}

function RateRow({ model, onOpen }: { model: RateRowModel; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-haspopup="dialog"
      aria-label={`${model.title}, ${model.caption}`}
      className={cn('flex min-h-16 items-center gap-3 rounded-card bg-card py-2.5 pl-3 pr-3.5 text-left text-ink', FOCUS)}
    >
      <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-pill bg-track">
        <Icon name={model.offline ? 'offline' : 'trend'} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-px">
        <span className="text-[15px] font-extrabold">{model.title}</span>
        <span className="type-label leading-[1.35] text-ink-muted">{model.caption}</span>
      </span>
      <Icon name="chevron" className="size-4 shrink-0" />
    </button>
  );
}

function AccountList({
  model,
  onOpen,
  onAdd,
  onHidden,
}: {
  model: AccountsListModel;
  onOpen: (id: string) => void;
  onAdd: () => void;
  onHidden: () => void;
}) {
  return (
    <section aria-labelledby="accounts-list" className="flex flex-col rounded-card bg-card py-1 [&>*+*]:border-t [&>*+*]:border-line">
      <h2 id="accounts-list" className="type-label px-4 pb-1 pt-3 font-bold text-ink-muted">
        Счета
      </h2>
      {model.rows.map((row) => (
        <button
          key={row.id}
          type="button"
          onClick={() => onOpen(row.id)}
          aria-label={row.ariaLabel}
          className={cn('flex min-h-16 items-center gap-3 px-4 py-2 text-left text-ink first-of-type:border-t-0', FOCUS_INSET)}
        >
          <AccountMark icon={row.icon} />
          <span className="flex min-w-0 flex-1 flex-col gap-px">
            <span className="type-body-strong truncate">{row.name}</span>
            <span className="type-label text-ink-muted">{row.caption}</span>
          </span>
          <span className="flex shrink-0 flex-col items-end gap-px">
            <span className="whitespace-nowrap text-[15px] font-extrabold tabular-nums">{row.balance}</span>
            {row.inUzs && <span className="type-label whitespace-nowrap text-ink-muted">{row.inUzs}</span>}
          </span>
        </button>
      ))}
      <button
        type="button"
        onClick={onAdd}
        aria-haspopup="dialog"
        className={cn('flex min-h-14 items-center gap-3 px-4 py-2 text-left text-[15px] font-extrabold text-ink', FOCUS_INSET)}
      >
        <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-pill border-2 border-dashed border-ink-muted">
          <Icon name="plus" className="size-[18px]" />
        </span>
        Добавить счёт
      </button>
      {model.hiddenLabel && (
        <button
          type="button"
          onClick={onHidden}
          aria-haspopup="dialog"
          className={cn('flex min-h-[52px] items-center justify-between gap-3 px-4 py-2 text-left text-[15px] font-bold text-ink', FOCUS_INSET)}
        >
          {model.hiddenLabel}
          <Icon name="chevron" className="size-4 shrink-0" />
        </button>
      )}
    </section>
  );
}

/** The same shapes while the accounts are read (Skeleton.md): the total, the rate row, three rows. */
function LoadingAccounts() {
  return (
    <div className="flex flex-col gap-3" aria-hidden="true">
      <div className="flex flex-col gap-2 rounded-hero bg-card px-5 pb-5 pt-4">
        <SkeletonBlock className="h-3.5 w-28" />
        <SkeletonBlock className="h-10 w-52" radius="tile" />
        <SkeletonBlock className="h-3 w-64" />
      </div>
      <div className="flex h-16 items-center gap-3 rounded-card bg-card px-3">
        <SkeletonBlock className="size-10" />
        <SkeletonBlock className="h-3.5 w-44" />
      </div>
      <div className="flex flex-col rounded-card bg-card px-4 py-2">
        {[0, 1, 2].map((row) => (
          <div key={row} className="flex h-16 items-center gap-3">
            <SkeletonBlock className="size-10 shrink-0" />
            <div className="flex flex-1 flex-col gap-1.5">
              <SkeletonBlock className="h-3.5 w-24" />
              <SkeletonBlock className="h-3 w-32" />
            </div>
            <SkeletonBlock className="h-3.5 w-24" />
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * The accounts (FT-118, boards «Счета · итог, курс, список», «Скрытые счета», «Счета · тёмная», «Счета · нет
 * связи»): the total of the visible accounts with the rate named under it, the rate row, the accounts with «≈ … сум»
 * under a dollar one, «Добавить счёт» and «Скрытые счета · N». At the bottom «Перевод или обмен», which opens the
 * transfer form (FT-119) — or «Для перевода нужен второй счёт» while one account is visible. The rate row opens
 * «Курс доллара» with the own rate (FT-119). Opened from Home's balance card; an account opens its own screen.
 */
export function AccountsPage() {
  const [today] = useState(() => toLocalDate(new Date()));
  const accounts = useAccounts();
  const rates = useUsdRate();
  const online = useIsOnline();
  const navigate = useNavigate();
  const [sheet, setSheet] = useState<'new' | 'hidden' | 'rate' | null>(null);
  // A new account and the rate start from a fresh sheet every time
  const [newSheetKey, setNewSheetKey] = useState(0);
  const [rateSheetKey, setRateSheetKey] = useState(0);


  const model = accounts.data ? accountsListModel(accounts.data, today) : null;
  // The row names the rate the total above it was counted at until the rates are read
  const known = knownRates(rates.data, accounts.data?.rate);
  const rateRow = rateRowModel(known, { online, today });
  const sheetOpen = (name: typeof sheet) => (open: boolean) => setSheet(open ? name : null);

  let content;
  if (model) {
    content = (
      <>
        <TotalCard model={model} />
        <RateRow
          model={rateRow}
          onOpen={() => {
            setRateSheetKey((key) => key + 1);
            setSheet('rate');
          }}
        />
        <AccountList
          model={model}
          onOpen={(id) => navigate(ROUTES.ACCOUNT(id))}
          onAdd={() => {
            setNewSheetKey((key) => key + 1);
            setSheet('new');
          }}
          onHidden={() => setSheet('hidden')}
        />
      </>
    );
  } else if (accounts.isError) {
    content = (
      <div className="flex flex-col items-start gap-1 rounded-card bg-card px-5 pb-2 pt-5">
        <p className="text-[14px] font-medium leading-[1.45] text-ink-muted">Не удалось загрузить счета.</p>
        <button
          type="button"
          onClick={() => void accounts.refetch()}
          disabled={accounts.isFetching}
          aria-busy={accounts.isFetching}
          className={cn('-ml-3 h-touch rounded-pill px-3 text-[14px] font-extrabold text-ink disabled:text-ink-muted', FOCUS)}
        >
          Попробовать снова
        </button>
      </div>
    );
  } else {
    content = (
      <>
        <LoadingAccounts />
        <span className="sr-only" role="status">
          Загружаем счета…
        </span>
      </>
    );
  }

  const transfer = model?.transfer;

  return (
    <div className="mx-auto w-full max-w-3xl text-ink">
      <div className="flex flex-col gap-3 px-4 pb-[calc(104px+env(safe-area-inset-bottom))] pt-2">
        <header className="flex h-key items-center gap-3">
          <BackButton />
          <h1 className="type-section text-ink">Счета</h1>
        </header>
        {content}
      </div>

      {transfer && (
        <div className="fixed inset-x-0 bottom-0 z-10 mx-auto w-full max-w-3xl bg-bg px-4 pb-[calc(24px+env(safe-area-inset-bottom))] pt-3">
          <Button
            onClick={() => {
              if (transfer.available) navigate(ROUTES.TRANSFER());
            }}
            aria-disabled={!transfer.available || undefined}
            className={cn('px-5', !transfer.available && 'bg-track text-seg-off active:scale-100')}
          >
            <Icon name="move" className="size-5" />
            {transfer.label}
          </Button>
        </div>
      )}

      {model && (
        <>
          <NewAccountSheet key={newSheetKey} open={sheet === 'new'} onOpenChange={sheetOpen('new')} />
          <HiddenAccountsSheet open={sheet === 'hidden'} onOpenChange={sheetOpen('hidden')} accounts={model.hidden} />
        </>
      )}
      <RateSheet key={rateSheetKey} open={sheet === 'rate'} onOpenChange={sheetOpen('rate')} rates={known} online={online} today={today} />

      {/* «Счёт добавлен», «Счёт снова виден», the rate and a move from the transfer form, over the bottom button (Toast.md) */}
      <UndoToast bottom={96} />
    </div>
  );
}
