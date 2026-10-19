import type { ReactNode } from 'react';
import { cn } from '@/shared/lib/utils';
import type { KeypadKey } from '@/shared/lib/money';
import { BackButton, Button, CategoryTile, Keypad, Segmented, SkeletonBlock } from '@/shared/ui/pastel';
import type { EntryType, ManualEntryModel } from '../model/manualEntry';

/** Whether a list the screen needs is there: read, being read, or failed to read. */
export type ListStatus = 'ready' | 'loading' | 'failed';

export interface ManualEntryViewProps {
  type: EntryType;
  note: string;
  model: ManualEntryModel;
  /** The accounts; `none` — a guest, who has no accounts. */
  accounts: ListStatus | 'none';
  categories: ListStatus;
  saving?: boolean;
  saveFailed?: boolean;
  onType: (type: EntryType) => void;
  onAccount: (accountId: string) => void;
  onCategory: (categoryId: string) => void;
  onKey: (key: KeypadKey) => void;
  onNote: (note: string) => void;
  onOpenDate: () => void;
  onSave: () => void;
  /** Reads the lists that failed again. */
  onRetry: () => void;
}

const TYPE_OPTIONS = [
  { value: 'expense', label: 'Расход' },
  { value: 'income', label: 'Доход' },
] as const;

const AMOUNT_SIZE: Record<ManualEntryModel['amount']['size'], string> = {
  50: 'type-amount-xl',
  40: 'text-[40px] leading-[1.1] font-bold tracking-[-1.3px]',
  32: 'text-[32px] leading-[1.1] font-bold tracking-[-0.9px]',
};

const AMOUNT_TONE: Record<ManualEntryModel['amount']['tone'], string> = {
  placeholder: 'text-ink-muted',
  expense: 'text-ink',
  income: 'text-income',
};

const FOCUS = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink';

function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section aria-label={label} className="flex flex-col gap-2">
      <h2 className="text-[13px] font-bold leading-[normal] tracking-normal text-ink-muted">{label}</h2>
      {children}
    </section>
  );
}

/** A list that could not be read says what is missing where it would stand, and offers to read it again. */
function ReadFailed({ what, onRetry }: { what: string; onRetry: () => void }) {
  return (
    <div className="flex min-h-control items-center justify-between gap-3 rounded-control bg-card px-4">
      <p className="type-label text-ink-muted">{`Не получилось загрузить ${what}`}</p>
      <Button variant="text" onClick={onRetry}>
        Попробовать снова
      </Button>
    </div>
  );
}

/**
 * The manual entry screen as the boards draw it (FT-113), from the state's model; `ManualEntry` holds the
 * state and writes the record. Everything fits one phone screen: the keypad and the main button sit at the
 * bottom, the system keyboard opens only for the note.
 */
export function ManualEntryView({
  type,
  note,
  model,
  accounts,
  categories,
  saving = false,
  saveFailed = false,
  onType,
  onAccount,
  onCategory,
  onKey,
  onNote,
  onOpenDate,
  onSave,
  onRetry,
}: ManualEntryViewProps) {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-3 bg-bg px-4 pb-4 pt-2 text-ink">
      <header className="flex h-key shrink-0 items-center gap-2">
        <BackButton />
        <Segmented options={TYPE_OPTIONS} value={type} onChange={onType} ariaLabel="Тип операции" className="min-w-0 flex-1" />
        <button
          type="button"
          onClick={onOpenDate}
          aria-label={model.date.ariaLabel}
          aria-haspopup="dialog"
          className={cn('h-touch shrink-0 rounded-pill bg-card px-3.5 text-[14px] font-bold text-ink', FOCUS)}
        >
          {model.date.label}
        </button>
      </header>

      <section aria-label="Сумма" className="flex flex-col items-center gap-1.5 pb-1 pt-2">
        <h1 className="text-[14px] font-semibold leading-[normal] tracking-normal text-ink-muted">Сумма</h1>
        <p aria-live="polite" className="flex h-[58px] items-baseline justify-center gap-2">
          <span className={cn('whitespace-nowrap tabular-nums', AMOUNT_SIZE[model.amount.size], AMOUNT_TONE[model.amount.tone])}>
            {model.amount.text}
          </span>
          <span className="text-[18px] font-semibold text-ink-muted">{model.amount.unit}</span>
        </p>
        {model.conversion && (
          <span className="flex h-7 items-center rounded-pill bg-track px-3 text-[13px] font-semibold text-ink-muted tabular-nums">
            {model.conversion}
          </span>
        )}
      </section>

      {accounts !== 'none' && (
        <Section label="Счёт">
          {accounts === 'failed' ? (
            <ReadFailed what="счета" onRetry={onRetry} />
          ) : accounts === 'loading' ? (
            <div aria-busy="true" className="grid grid-cols-3 gap-2">
              {[0, 1, 2].map((index) => <SkeletonBlock key={index} className="h-control" radius="tile" />)}
            </div>
          ) : (
            <div role="radiogroup" aria-label="Счёт" className="grid grid-cols-3 gap-2">
              {model.accounts.map((account) => (
                <button
                  key={account.id}
                  type="button"
                  role="radio"
                  aria-checked={account.selected}
                  onClick={() => onAccount(account.id)}
                  className={cn(
                    'flex h-control min-w-0 flex-col items-start justify-center gap-px rounded-control px-3.5 text-left',
                    FOCUS,
                    'focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
                    account.selected ? 'bg-primary text-on-primary' : 'bg-card text-ink'
                  )}
                >
                  <span className="max-w-full truncate text-[14px] font-bold leading-[1.2]">{account.name}</span>
                  <span
                    className={cn(
                      'max-w-full truncate whitespace-nowrap text-[11px] font-semibold leading-[1.4] tabular-nums',
                      account.selected ? 'text-on-primary-muted' : 'text-ink-muted'
                    )}
                  >
                    {account.balance}
                  </span>
                </button>
              ))}
            </div>
          )}
        </Section>
      )}

      <Section label="Категория">
        {categories === 'failed' ? (
          <ReadFailed what="категории" onRetry={onRetry} />
        ) : categories === 'loading' ? (
          <div aria-busy="true" className="grid grid-cols-4 gap-2">
            {Array.from({ length: 8 }, (_, index) => <SkeletonBlock key={index} className="h-key" radius="tile" />)}
          </div>
        ) : (
          <div role="radiogroup" aria-label={model.categoriesTitle} className="grid grid-cols-4 gap-2">
            {model.categories.map((category) => (
              <CategoryTile
                key={category.id}
                name={category.name}
                color={category.color}
                selected={category.selected}
                onSelect={() => onCategory(category.id)}
              />
            ))}
          </div>
        )}
      </Section>

      <label className="flex h-key shrink-0 items-center gap-3 rounded-pill bg-card px-5 focus-within:ring-2 focus-within:ring-ink">
        <span className="shrink-0 text-[13px] font-bold text-ink-muted">Заметка</span>
        <input
          type="text"
          value={note}
          onChange={(event) => onNote(event.target.value)}
          placeholder="Например, супермаркет"
          maxLength={500}
          enterKeyHint="done"
          className="type-body h-touch min-w-0 flex-1 bg-transparent text-ink outline-none placeholder:text-ink-muted"
        />
      </label>

      <div className="mt-auto flex flex-col gap-3">
        <Keypad currency={model.currency} onKey={onKey} />
        {saveFailed && (
          <p role="alert" className="type-label text-center text-ink">
            Не получилось сохранить. Проверьте связь и нажмите ещё раз.
          </p>
        )}
        <Button onClick={onSave} disabled={!model.save.ready || saving} aria-busy={saving}>
          {model.save.label}
        </Button>
      </div>
    </div>
  );
}
