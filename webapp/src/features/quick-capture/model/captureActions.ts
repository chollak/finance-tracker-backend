import type { LucideIcon } from 'lucide-react';
import { Keyboard, Mic, ScanLine } from 'lucide-react';

/**
 * The three ways the product wants a capture to start: scan a receipt, speak it, type it.
 *
 * Only typing is implemented in the Mini App, and only voice-through-Telegram is implemented
 * at all. The row exists so the entry points are visible and honest about that — a tile says
 * what it can do today, never what the roadmap says it will do. `hint` is the copy shown when
 * the tile is pressed; for an unavailable action it has to explain the working alternative,
 * because a dead button with no explanation is worse than no button.
 */
export type CaptureActionId = 'scan' | 'voice' | 'manual';

export interface CaptureAction {
  id: CaptureActionId;
  label: string;
  /** Second line on the tile — names the channel that actually does the work. */
  caption: string;
  icon: LucideIcon;
  /** `false` renders the tile as unavailable — styled and named as such, never disabled. */
  isAvailable: boolean;
  /** Shown next to an unavailable tile. */
  badge?: string;
  /** Panel copy shown while this action is the active one. */
  hint?: string;
}

export const CAPTURE_ACTIONS: readonly CaptureAction[] = [
  {
    id: 'scan',
    label: 'Чек',
    caption: 'Пока нет',
    icon: ScanLine,
    isAvailable: false,
    badge: 'Скоро',
    hint: 'Сканирование чека ещё не сделано — ни здесь, ни в боте. Запишите операцию текстом: «такси 18к».',
  },
  {
    id: 'voice',
    label: 'Голос',
    caption: 'В Telegram',
    icon: Mic,
    isAvailable: true,
    hint: 'Голос через Telegram уже работает: откройте чат с ботом, нажмите микрофон и продиктуйте операцию. Здесь, в Mini App, запись с микрофона не сделана — можно продиктовать текст клавиатурой в поле ниже.',
  },
  {
    id: 'manual',
    label: 'Текстом',
    caption: 'Здесь',
    icon: Keyboard,
    isAvailable: true,
  },
] as const;

/**
 * Which action the card should show as active after `pressed` is tapped.
 *
 * `manual` never opens a panel: it is the input already on screen, so pressing it just puts the
 * user back in the textarea. Pressing the active action again closes its panel, so the hint can
 * be dismissed with the same tile that opened it.
 */
export function nextActiveCaptureAction(
  current: CaptureActionId | null,
  pressed: CaptureActionId
): CaptureActionId | null {
  if (pressed === 'manual') {
    return null;
  }

  return current === pressed ? null : pressed;
}

/**
 * Accessible name for a tile.
 *
 * An unavailable action says so in its own name instead of carrying `aria-disabled`. The tile is
 * genuinely operable — pressing it is the only way to read the explanation — so marking it
 * disabled told assistive tech and test drivers not to operate the one control that answers
 * "why can't I scan a receipt?". Unavailability belongs in the copy, not in a state that blocks
 * the press.
 */
export function captureActionAccessibleLabel(action: CaptureAction): string {
  if (action.isAvailable) {
    return `${action.label} — ${action.caption}`;
  }

  const unavailable = `${action.label} — недоступно${action.badge ? ` (${action.badge})` : ''}`;

  return action.hint ? `${unavailable}. Нажмите, чтобы узнать, как записать операцию` : unavailable;
}

/** The panel copy for an active action, or nothing when that action has no panel. */
export function captureActionHintFor(id: CaptureActionId | null): string | undefined {
  if (!id) {
    return undefined;
  }

  return CAPTURE_ACTIONS.find((action) => action.id === id)?.hint;
}
