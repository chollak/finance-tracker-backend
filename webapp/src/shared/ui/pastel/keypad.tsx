import { Delete } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { keypadExtraKey, pressKey, type Currency, type KeypadKey, type KeypadState } from '@/shared/lib/money';

type KeypadProps = {
  currency: Currency;
  className?: string;
} & (
  | { state: KeypadState; onChange: (state: KeypadState) => void }
  /** The pressed key instead, for a screen with its own typing rules (first launch, FT-109). */
  | { onKey: (key: KeypadKey) => void }
);

const DIGIT_ROWS: KeypadKey[][] = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
];

/**
 * The app's own number keypad (docs/pastel/components/Keypad.md): 3×4 pills, the bottom row is
 * «000» (a comma for a dollar account), 0 and erase. Used instead of the phone keyboard, which in
 * Telegram's WebView shifts and covers the screen unpredictably.
 */
export function Keypad(props: KeypadProps) {
  const { currency, className } = props;
  const extra = keypadExtraKey(currency);
  const rows: KeypadKey[][] = [...DIGIT_ROWS, [extra, '0', 'del']];
  const press = (key: KeypadKey) =>
    'onKey' in props ? props.onKey(key) : props.onChange(pressKey(props.state, key, currency));

  return (
    <div role="group" aria-label="Цифровая клавиатура" className={cn('grid grid-cols-3 gap-2', className)}>
      {rows.flat().map((key) => (
        <button
          key={key}
          type="button"
          onClick={() => press(key)}
          aria-label={key === 'del' ? 'Стереть' : key === '000' ? 'Три нуля' : key === ',' ? 'Запятая' : undefined}
          className={cn(
            'flex h-key items-center justify-center rounded-pill bg-card font-semibold tabular-nums text-ink',
            // «000» is a word-sized key on every board: 17px against the digits' 23px
            key === '000' ? 'text-[17px]' : 'text-[23px]',
            'transition-[transform,background-color] duration-100 active:scale-[0.97] active:bg-track',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink'
          )}
        >
          {key === 'del' ? <Delete aria-hidden="true" className="size-6" strokeWidth={1.9} /> : key}
        </button>
      ))}
    </div>
  );
}
