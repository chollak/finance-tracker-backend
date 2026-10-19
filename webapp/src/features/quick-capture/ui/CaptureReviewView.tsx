import { cn } from '@/shared/lib/utils';
import { pastelBgClass } from '@/shared/lib/pastel/categoryColors';
import { BackButton, Button } from '@/shared/ui/pastel';
import type { ReviewItemView, ReviewModel } from '../model/captureReview';

export interface CaptureReviewViewProps {
  model: ReviewModel;
  /** The records are being taken back («Изменить», «Назад»): nothing else is pressed meanwhile. */
  busy?: boolean;
  onEdit: () => void;
  onSave: () => void;
  onCategory: (id: string) => void;
  onAccount: (id: string) => void;
  onDate: (id: string) => void;
  onRemove: (id: string) => void;
  onConvert: (id: string) => void;
}

const FOCUS = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2 focus-visible:ring-offset-card';
const CHIP = 'flex h-touch shrink-0 items-center rounded-pill px-3.5 text-[14px] font-bold';

function Check() {
  return (
    <span aria-hidden="true" className="flex size-[22px] shrink-0 items-center justify-center rounded-pill bg-pastel-mint text-mint-ink">
      <svg width="12" height="12" viewBox="0 0 20 20">
        <path d="M4.5 10.5 8 14l7.5-8" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

function Cross() {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" aria-hidden="true">
      <path d="M5.5 5.5l9 9m0-9-9 9" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function ItemCard({ item, busy, ...on }: { item: ReviewItemView; busy: boolean } & Pick<CaptureReviewViewProps, 'onCategory' | 'onAccount' | 'onDate' | 'onRemove' | 'onConvert'>) {
  return (
    <li className="flex flex-col gap-2 rounded-card bg-card pb-3.5 pl-[18px] pr-1.5 pt-2.5">
      <div className="flex items-center gap-2">
        <p className="flex shrink-0 items-baseline gap-1.5">
          <span
            className={cn(
              'whitespace-nowrap text-[26px] font-extrabold leading-[1.15] tracking-[-0.8px] tabular-nums',
              item.tone === 'income' ? 'text-income' : 'text-ink'
            )}
          >
            {item.amount}
          </span>
          <span className="text-[13px] font-bold text-ink-muted">{item.unit}</span>
        </p>
        <span className="min-w-0 flex-1 truncate text-right text-[13px] font-medium text-ink-muted">{item.note}</span>
        <button
          type="button"
          onClick={() => on.onRemove(item.id)}
          disabled={busy}
          aria-label={item.removeAria}
          className={cn('flex size-touch shrink-0 items-center justify-center rounded-pill text-ink-muted', FOCUS)}
        >
          <Cross />
        </button>
      </div>

      <div className="flex flex-wrap gap-2 pr-3">
        <button
          type="button"
          onClick={() => on.onCategory(item.id)}
          disabled={busy}
          aria-haspopup="dialog"
          aria-label={item.category.aria}
          className={cn(
            CHIP,
            'gap-1.5 border-2',
            FOCUS,
            item.category.guessed
              ? 'border-dashed border-ink-muted bg-transparent text-ink'
              : cn('border-transparent text-pastel-ink', pastelBgClass[item.category.color])
          )}
        >
          <span>{item.category.name}</span>
          {item.category.guessed && (
            <span aria-hidden="true" className="font-extrabold">
              ?
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={() => on.onAccount(item.id)}
          disabled={busy}
          aria-haspopup="dialog"
          aria-label={item.account.aria}
          className={cn(CHIP, 'bg-track text-ink', FOCUS)}
        >
          {item.account.name}
        </button>
        <button
          type="button"
          onClick={() => on.onDate(item.id)}
          disabled={busy}
          aria-haspopup="dialog"
          aria-label={item.date.aria}
          className={cn(CHIP, 'bg-track text-ink', FOCUS)}
        >
          {item.date.label}
        </button>
      </div>

      {item.thousands && <p className="pr-3 text-[13px] font-semibold leading-[1.35] text-ink-muted">{item.thousands}</p>}

      {item.conversion && (
        <div role="status" className="flex flex-col items-start gap-2 pr-3">
          <span className="text-[13px] font-semibold leading-[1.35] text-ink-muted">{item.conversion.note}</span>
          <button
            type="button"
            onClick={() => on.onConvert(item.id)}
            disabled={busy}
            className={cn('h-touch rounded-pill bg-track px-4 text-[14px] font-extrabold text-ink', FOCUS)}
          >
            {item.conversion.label}
          </button>
        </div>
      )}
    </li>
  );
}

/**
 * The review of the records one phrase made, as the boards «Проверка записей» and «Проверка записей ·
 * тёмная» draw it (FT-114), from the model; `CaptureReview` holds the records and acts. The header with
 * «Назад»; the phrase in a card with how many records it made, how many to check, and «Изменить»; one card
 * per record — the signed amount and its unit, the note, «×», and the chips of the category («Кафе ?» dashed
 * while it is the AI's guess), the account and the date; one main button at the bottom.
 */
export function CaptureReviewView({ model, busy = false, onEdit, onSave, ...on }: CaptureReviewViewProps) {
  return (
    <div className="mx-auto flex min-h-[calc(100dvh-env(safe-area-inset-bottom))] w-full max-w-md flex-col gap-3 bg-bg px-4 pb-4 pt-2 text-ink">
      <header className="flex h-key shrink-0 items-center gap-3">
        <BackButton />
        <h1 className="text-[18px] font-extrabold leading-[1.3] tracking-[-0.3px] text-ink">Проверьте записи</h1>
      </header>

      <section aria-label="Исходный текст" className="flex flex-col gap-1 rounded-card bg-card pb-1 pl-[18px] pr-2 pt-3.5">
        <p className="pr-2.5 text-[15px] font-medium leading-[1.45] text-ink">{model.text}</p>
        <div className="flex items-center justify-between gap-2">
          <span className="flex min-w-0 items-center gap-2 text-[13px] font-semibold text-ink-muted">
            <Check />
            {model.summary}
          </span>
          <button
            type="button"
            onClick={onEdit}
            disabled={busy}
            aria-busy={busy}
            className={cn('h-touch shrink-0 rounded-pill px-2.5 text-[14px] font-extrabold text-ink underline underline-offset-4', FOCUS)}
          >
            Изменить
          </button>
        </div>
      </section>

      <ul aria-label="Распознанные операции" className="flex flex-col gap-2">
        {model.items.map((item) => (
          <ItemCard key={item.id} item={item} busy={busy} {...on} />
        ))}
      </ul>

      <div className="mt-auto flex flex-col pt-2">
        <Button onClick={onSave} disabled={!model.save.ready || busy}>
          {model.save.label}
        </Button>
      </div>
    </div>
  );
}
