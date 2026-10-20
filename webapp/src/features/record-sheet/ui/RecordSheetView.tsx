import type { ReactNode } from 'react';
import { Check, ChevronLeft, ChevronRight, Pencil, Trash2, X } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import type { KeypadKey } from '@/shared/lib/money';
import { pastelBgClass } from '@/shared/lib/pastel/categoryColors';
import { Button, Keypad, Segmented, SkeletonBlock } from '@/shared/ui/pastel';
import type { AmountEntryModel, RecordSheetModel, RecordType, SheetFieldKind } from '../model/recordSheet';
import type { SaveStatus } from '../api/useRecordEdits';

const FOCUS = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink';

const TYPE_OPTIONS = [
  { value: 'expense', label: 'Расход' },
  { value: 'income', label: 'Доход' },
] as const;

/** A round 44px button on `sheet-card`: «Закрыть» and «Назад» in the sheet's header. */
function RoundButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className={cn('flex size-touch shrink-0 items-center justify-center rounded-pill bg-sheet-card text-ink', FOCUS)}
    >
      {children}
    </button>
  );
}

// ── The record (board «Карточка операции») ─────────────────────────────────────────────────────────────

/** «Расход / Доход» and «Закрыть». */
export function RecordHeader({ type, onType, onClose }: { type: RecordType; onType: (type: RecordType) => void; onClose: () => void }) {
  return (
    <div className="flex items-center gap-3">
      <Segmented options={TYPE_OPTIONS} value={type} onChange={onType} ariaLabel="Тип операции" className="min-w-0 flex-1" />
      <RoundButton label="Закрыть" onClick={onClose}>
        <X aria-hidden="true" className="size-[18px]" strokeWidth={2} />
      </RoundButton>
    </div>
  );
}

const STATUS_TEXT: Record<Exclude<SaveStatus, 'idle' | 'saved'>, string> = {
  'save-failed': 'Не получилось сохранить. Проверьте связь',
  'delete-failed': 'Не получилось удалить. Проверьте связь',
};

/** The line under the fields: «Изменения сохраняются сразу», «✓ Сохранено» for 2 seconds, or what failed. */
function SaveLine({ status }: { status: SaveStatus }) {
  const saved = status === 'saved';
  const failed = status === 'save-failed' || status === 'delete-failed';
  return (
    <div className={cn('flex min-h-5 items-center gap-1.5 px-1 text-[13px] font-semibold', saved || failed ? 'text-ink' : 'text-ink-muted')}>
      {saved && (
        <span aria-hidden="true" className="flex size-[18px] shrink-0 items-center justify-center rounded-pill bg-pastel-mint text-mint-ink">
          <Check className="size-[11px]" strokeWidth={3.2} />
        </span>
      )}
      {/* Only «Сохранено» is announced (TxnSheet.md); a failure is an alert */}
      <span aria-live="polite">{saved ? 'Сохранено' : ''}</span>
      {failed ? <span role="alert">{STATUS_TEXT[status]}</span> : !saved && <span>Изменения сохраняются сразу</span>}
    </div>
  );
}

export interface RecordBodyProps {
  model: RecordSheetModel;
  status: SaveStatus;
  deleting: boolean;
  onAmount: () => void;
  onField: (kind: SheetFieldKind) => void;
  onRecalculate: () => void;
  onDone: () => void;
  onDelete: () => void;
}

/**
 * The sheet of a record (TxnSheet.md): the amount as a big button with a pencil, «Пересчитать» after a move
 * to another currency, the fields in one card with 56px rows, the save line, «Готово» and «Удалить операцию».
 */
export function RecordBody({ model, status, deleting, onAmount, onField, onRecalculate, onDone, onDelete }: RecordBodyProps) {
  return (
    <>
      <button
        type="button"
        onClick={onAmount}
        aria-label={model.amount.aria}
        className={cn('flex h-[76px] shrink-0 items-center gap-2 rounded-card bg-sheet-card pl-5 pr-3.5 text-left text-ink', FOCUS)}
      >
        <span className="flex min-w-0 flex-1 items-baseline gap-2">
          <span
            className={cn(
              'whitespace-nowrap',
              model.amount.large ? 'type-amount-card' : 'text-[26px] font-extrabold leading-[1.1] tracking-[-1px] tabular-nums',
              model.amount.tone === 'income' ? 'text-income' : 'text-ink'
            )}
          >
            {model.amount.text}
          </span>
          <span className="text-[16px] font-bold text-ink-muted">{model.amount.unit}</span>
        </span>
        <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-pill bg-sheet-track text-ink">
          <Pencil className="size-[18px]" strokeWidth={1.8} />
        </span>
      </button>

      {model.recalculation && (
        <div role="status" className="flex shrink-0 flex-col items-start gap-2 rounded-card bg-sheet-card py-3 pl-4 pr-3 text-ink">
          <span className="text-[13px] font-semibold leading-[1.35]">{model.recalculation.note}</span>
          <button
            type="button"
            onClick={onRecalculate}
            className={cn('h-touch whitespace-nowrap rounded-pill bg-sheet-track px-4 text-[14px] font-extrabold tabular-nums text-ink', FOCUS)}
          >
            {model.recalculation.label}
          </button>
        </div>
      )}

      <div className="flex shrink-0 flex-col rounded-card bg-sheet-card px-4">
        {model.fields.map((field, index) => (
          <button
            key={field.kind}
            type="button"
            onClick={() => onField(field.kind)}
            aria-haspopup="dialog"
            aria-label={field.aria}
            className={cn(
              'flex min-h-14 items-center gap-2.5 text-left text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ink',
              index > 0 && 'border-t border-line'
            )}
          >
            <span className="w-20 shrink-0 text-[13px] font-semibold text-ink-muted">{field.label}</span>
            <span className="flex min-w-0 flex-1 items-center justify-end gap-2">
              {field.color && <span aria-hidden="true" className={cn('size-3.5 shrink-0 rounded-pill', pastelBgClass[field.color])} />}
              <span className={cn('type-body-strong truncate', field.empty ? 'text-ink-muted' : 'text-ink')}>{field.value}</span>
            </span>
            <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-ink-muted" strokeWidth={2} />
          </button>
        ))}
      </div>

      <SaveLine status={status} />

      <div className="flex shrink-0 flex-col gap-2">
        <Button onClick={onDone}>Готово</Button>
        <button
          type="button"
          onClick={onDelete}
          disabled={deleting}
          aria-busy={deleting}
          className={cn('flex h-touch items-center justify-center gap-2 rounded-pill text-[15px] font-bold text-ink disabled:text-ink-muted', FOCUS)}
        >
          <Trash2 aria-hidden="true" className="size-[18px]" strokeWidth={1.7} />
          Удалить операцию
        </button>
      </div>
    </>
  );
}

/** While the record of a link is read, the sheet keeps the board's shape. */
export function RecordLoading() {
  return (
    <div aria-busy="true" className="flex flex-col gap-3">
      <SkeletonBlock className="h-12" radius="pill" />
      <SkeletonBlock className="h-[76px]" radius="card" />
      <SkeletonBlock className="h-56" radius="card" />
      <span className="sr-only">Загружаем операцию…</span>
    </div>
  );
}

/** The record could not be read: gone, or not reached. */
export function RecordUnavailable({ gone, onRetry, onClose }: { gone: boolean; onRetry: () => void; onClose: () => void }) {
  return (
    <div className="flex flex-col gap-3">
      <p className="rounded-card bg-sheet-card p-5 text-[14px] font-medium leading-[1.45] text-ink-muted">
        {gone ? 'Этой операции больше нет — её удалили.' : 'Не получилось загрузить операцию. Проверьте связь.'}
      </p>
      {gone ? <Button onClick={onClose}>Закрыть</Button> : <Button onClick={onRetry}>Попробовать снова</Button>}
    </div>
  );
}

// ── The amount (board «Карточка · правка суммы») ─────────────────────────────────────────────────────

/** «Назад» and a heading: the amount and the note modes. */
export function ModeHeader({ title, onBack, action }: { title: string; onBack: () => void; action?: ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <RoundButton label="Назад к операции" onClick={onBack}>
        <ChevronLeft aria-hidden="true" className="size-5" strokeWidth={2} />
      </RoundButton>
      <h2 className="type-section min-w-0 flex-1 text-ink">{title}</h2>
      {action}
    </div>
  );
}

const AMOUNT_SIZE: Record<AmountEntryModel['size'], string> = {
  50: 'type-amount-xl',
  40: 'text-[40px] leading-[1.1] font-bold tracking-[-1.3px] tabular-nums',
  32: 'text-[32px] leading-[1.1] font-bold tracking-[-0.9px] tabular-nums',
};

const AMOUNT_TONE: Record<AmountEntryModel['tone'], string> = {
  placeholder: 'text-ink-muted',
  expense: 'text-ink',
  income: 'text-income',
};

/** The amount on the app's own keypad: pale until the first key, which replaces it; «Готово» saves it. */
export function AmountBody({
  model,
  currency,
  onKey,
  onDone,
}: {
  model: AmountEntryModel;
  currency: 'UZS' | 'USD';
  onKey: (key: KeypadKey) => void;
  onDone: () => void;
}) {
  return (
    <>
      <div className="flex shrink-0 flex-col items-center gap-1.5 py-1">
        <p aria-live="polite" className="flex h-[58px] items-baseline justify-center gap-2">
          <span className={cn('whitespace-nowrap', AMOUNT_SIZE[model.size], AMOUNT_TONE[model.tone], model.pale && 'opacity-55')}>
            {model.text}
          </span>
          <span className="text-[18px] font-semibold text-ink-muted">{model.unit}</span>
        </p>
        {model.conversion && (
          <span className="flex h-7 items-center rounded-pill bg-sheet-track px-3 text-[13px] font-semibold tabular-nums text-ink">
            {model.conversion}
          </span>
        )}
      </div>
      <Keypad currency={currency} onKey={onKey} inSheet className="shrink-0" />
      <Button inSheet onClick={onDone} disabled={!model.save.ready}>
        {model.save.label}
      </Button>
    </>
  );
}

// ── The note ─────────────────────────────────────────────────────────────────────────────────────────

/**
 * The note at the top of the sheet, so the phone's keyboard does not cover it (TxnSheet.md); «Готово» in the
 * header and Enter save it.
 */
export function NoteBody({ value, onChange, onDone }: { value: string; onChange: (value: string) => void; onDone: () => void }) {
  return (
    <label className="flex h-button shrink-0 items-center rounded-pill bg-sheet-card px-5 focus-within:ring-2 focus-within:ring-ink">
      <span className="sr-only">Текст заметки</span>
      <input
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            onDone();
          }
        }}
        // The note mode is opened to type: the field takes the focus at once
        autoFocus
        enterKeyHint="done"
        maxLength={500}
        placeholder="Например, обед с командой"
        className="h-touch min-w-0 flex-1 bg-transparent text-[16px] font-semibold text-ink outline-none placeholder:text-ink-muted"
      />
    </label>
  );
}

export function NoteDone({ onDone }: { onDone: () => void }) {
  return (
    <button
      type="button"
      onClick={onDone}
      className={cn('h-touch shrink-0 rounded-pill bg-primary px-[18px] text-[15px] font-extrabold text-on-primary', FOCUS)}
    >
      Готово
    </button>
  );
}
