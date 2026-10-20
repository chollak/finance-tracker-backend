import { useEffect } from 'react';
import { keyFromKeyboard, type Currency, type KeypadKey } from '@/shared/lib/money';

function isTextField(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));
}

/** From a computer keyboard (Telegram Desktop): the same digits, erase and comma as the keypad — not into a field. */
export function useKeypadKeyboard(currency: Currency, onKey: (key: KeypadKey) => void, enabled = true): void {
  useEffect(() => {
    if (!enabled) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey || isTextField(event.target)) return;
      const key = keyFromKeyboard(event.key, currency);
      if (!key) return;
      event.preventDefault();
      onKey(key);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [currency, onKey, enabled]);
}
