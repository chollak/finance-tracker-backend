import type { ReactNode } from 'react';
import { LogIn } from 'lucide-react';
import type { AccountIcon as AccountIconKind } from '@/entities/account';
import { useCloseScreen } from '@/shared/lib/navigation';
import { cn } from '@/shared/lib/utils';
import { BackButton, ProblemScreen } from '@/shared/ui/pastel';
import type { AmountView } from '../model/accountForms';

export const FOCUS = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink';
export const FOCUS_INSET = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ink';

/** Line icons of the accounts boards, 20×20, drawn in `currentColor`. */
export function Icon({
  name,
  className,
}: {
  name: 'cash' | 'card' | 'trend' | 'offline' | 'move' | 'adjust' | 'plus' | 'chevron' | 'down' | 'swap' | 'trash' | 'hide' | 'show';
  className?: string;
}) {
  const common = { width: 20, height: 20, viewBox: '0 0 20 20', 'aria-hidden': true, className, fill: 'none', stroke: 'currentColor' } as const;
  switch (name) {
    case 'cash':
      return (
        <svg {...common}>
          <rect x="2" y="5.5" width="16" height="9" rx="1.5" strokeWidth="1.8" />
          <circle cx="10" cy="10" r="2" strokeWidth="1.6" />
        </svg>
      );
    case 'card':
      return (
        <svg {...common}>
          <rect x="2.5" y="4.5" width="15" height="11" rx="2" strokeWidth="1.8" />
          <path d="M2.5 8.5h15" strokeWidth="1.8" />
        </svg>
      );
    case 'trend':
      return (
        <svg {...common}>
          <path d="M3 14l4-4 3 3 7-7M13 6h4v4" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case 'offline':
      return (
        <svg {...common}>
          <path
            d="M2.5 7.5a11 11 0 0 1 4-2.4M17.5 7.5a11 11 0 0 0-6.3-3M5 10.5a7 7 0 0 1 3-1.8M15 10.5a7 7 0 0 0-1.6-1.1M7.6 13.4a3.5 3.5 0 0 1 4.8 0M10 16.5h.01M3 3l14 14"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </svg>
      );
    case 'move':
      return (
        <svg {...common}>
          <path d="M4 7h11m-3-3 3 3-3 3M16 13H5m3 3-3-3 3-3" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case 'adjust':
      return (
        <svg {...common}>
          <path d="M10 3.5v7M6.5 7h7M6.5 15.5h7" strokeWidth="2" strokeLinecap="round" />
        </svg>
      );
    case 'plus':
      return (
        <svg {...common}>
          <path d="M10 4v12M4 10h12" strokeWidth="2.2" strokeLinecap="round" />
        </svg>
      );
    case 'chevron':
      return (
        <svg {...common}>
          <path d="M7.5 4.5 13 10l-5.5 5.5" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case 'down':
      return (
        <svg {...common}>
          <path d="M5 7.5 10 12.5l5-5" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case 'swap':
      return (
        <svg {...common}>
          <path d="M7 4v12m-3-3 3 3 3-3M13 16V4m-3 3 3-3 3 3" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case 'trash':
      return (
        <svg {...common}>
          <path d="M4 6h12M8 6V4.5h4V6M6 6l.8 10h6.4L14 6" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case 'hide':
      return (
        <svg {...common}>
          <path
            d="M3 3l14 14M8.2 5.2A8 8 0 0 1 10 5c4.2 0 7 5 7 5a13 13 0 0 1-2.3 2.8M12 14.6a6.7 6.7 0 0 1-2 .4c-4.2 0-7-5-7-5a13 13 0 0 1 2.6-3.1M8.6 8.6a2 2 0 0 0 2.8 2.8"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
    case 'show':
      return (
        <svg {...common}>
          <path d="M3 10s2.8-5 7-5 7 5 7 5-2.8 5-7 5-7-5-7-5z" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="10" cy="10" r="2" strokeWidth="1.7" />
        </svg>
      );
  }
}

/** A guest keeps records on the device and has no accounts: the list and an account's link say so (ProblemScreen.md). */
export function GuestAccounts() {
  const close = useCloseScreen();
  return (
    <ProblemScreen
      header={<BackButton />}
      icon={<LogIn strokeWidth={1.9} />}
      title="Счета — после входа"
      text="Счета и остатки хранятся в Daftar, а не на телефоне. Войдите через Telegram, и они появятся здесь."
      action={{ label: 'На главную', onClick: close }}
    />
  );
}

/** The 40px circle on `track` of an account: banknote, card or «$» (AccountList.md). */
export function AccountMark({ icon }: { icon: AccountIconKind }) {
  return (
    <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-pill bg-track text-ink">
      {icon === 'usd' ? <span className="text-[17px] font-extrabold">$</span> : <Icon name={icon} />}
    </span>
  );
}

/** «подпись сверху, значение снизу» in a sheet card (AccountMoves.md, «Изменить или скрыть счёт»). */
export function SheetField({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-col gap-0.5 py-3', className)}>
      <span className="type-label font-bold text-ink-muted">{label}</span>
      {children}
    </div>
  );
}

/** The amount card above a sheet's keypad: the label, the number (a hint is muted), its unit and one line under it. */
export function AmountCard({ label, amount, note }: { label: string; amount: AmountView; note?: string | null }) {
  return (
    <div className="flex shrink-0 flex-col gap-1 rounded-card bg-sheet-card px-4 py-3">
      <span className="type-label font-bold text-ink-muted">{label}</span>
      <p aria-live="polite" className="flex items-baseline gap-1.5">
        <span
          className={cn(
            'whitespace-nowrap text-[32px] font-extrabold leading-[1.1] tracking-[-1px] tabular-nums',
            amount.placeholder ? 'text-ink-muted' : 'text-ink'
          )}
        >
          {amount.text}
        </span>
        <span className="text-[15px] font-bold text-ink-muted">{amount.unit}</span>
      </p>
      {note && <span className="type-label leading-[1.45] text-ink-muted">{note}</span>}
    </div>
  );
}

/** The name field of «Новый счёт» and «Изменить»: a pill on `sheet-card`, the label above it. */
export function NameField({
  value,
  onChange,
  placeholder,
  onFocusChange,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  onFocusChange?: (focused: boolean) => void;
}) {
  return (
    <label className="flex shrink-0 flex-col gap-1.5">
      <span className="type-label px-1 font-bold text-ink-muted">Название</span>
      <input
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onFocus={() => onFocusChange?.(true)}
        onBlur={() => onFocusChange?.(false)}
        maxLength={40}
        placeholder={placeholder}
        enterKeyHint="done"
        className="h-control rounded-pill bg-sheet-card px-4 text-[16px] font-semibold text-ink outline-none placeholder:text-ink-muted focus:ring-2 focus:ring-ink"
      />
    </label>
  );
}

/** A secondary button of a sheet on `sheet-card` with a line icon: «Удалить обмен», «Скрыть счёт», «Показать счёт». */
export function SheetSecondaryButton({
  icon,
  children,
  onClick,
  disabled,
  busy,
}: {
  icon: 'trash' | 'hide' | 'show';
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  /** The write is on its way: the button waits instead of firing twice. */
  busy?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      className={cn(
        'flex h-control shrink-0 items-center justify-center gap-2 rounded-pill bg-sheet-card text-[15px] font-extrabold text-ink',
        'disabled:text-seg-off',
        FOCUS
      )}
    >
      <Icon name={icon} className="size-[18px]" />
      {children}
    </button>
  );
}

/** A read failed: says so and reads again (a problem says what to do). */
export function ReadFailed({ text, onRetry, retrying }: { text: string; onRetry: () => void; retrying: boolean }) {
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
