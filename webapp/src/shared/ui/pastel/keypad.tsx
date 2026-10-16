import { Delete } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { keypadExtraKey, pressKey, type Currency, type KeypadKey, type KeypadState } from '@/shared/lib/money';

interface KeypadProps {
  currency: Currency;
  state: KeypadState;
  onChange: (state: KeypadState) => void;
  className?: string;
}

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
export function Keypad({ currency, state, onChange, className }: KeypadProps) {
  const extra = keypadExtraKey(currency);
  const rows: KeypadKey[][] = [...DIGIT_ROWS, [extra, '0', 'del']];
  const press = (key: KeypadKey) => onChange(pressKey(state, key, currency));

  return (
    <div className={cn('grid grid-cols-3 gap-2', className)}>
      {rows.flat().map((key) => (
        <button
          key={key}
          type="button"
          onClick={() => press(key)}
          aria-label={key === 'del' ? 'Стереть' : key === '000' ? 'Три нуля' : key === ',' ? 'Запятая' : undefined}
          className={cn(
            'flex h-key items-center justify-center rounded-pill bg-card text-[23px] font-semibold tabular-nums text-ink',
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
