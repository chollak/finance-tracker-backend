import { describe, it, expect } from 'vitest';

import {
  CAPTURE_ACTIONS,
  captureActionAccessibleLabel,
  captureActionHintFor,
  nextActiveCaptureAction,
} from './captureActions';

// The action row advertises capture entry points, so its copy is the part that can lie.
// These tests pin the two honesty rules: an unavailable action must be marked unavailable
// (not just worded softly), and the voice tile must point at Telegram, which is where voice
// capture actually runs — the Mini App does not record audio.
describe('CAPTURE_ACTIONS', () => {
  it('offers scan, voice and manual in that order', () => {
    expect(CAPTURE_ACTIONS.map((action) => action.id)).toEqual(['scan', 'voice', 'manual']);
  });

  it('marks receipt scanning as unavailable rather than wording it as coming soon', () => {
    const scan = CAPTURE_ACTIONS.find((action) => action.id === 'scan');

    expect(scan?.isAvailable).toBe(false);
    expect(scan?.badge).toBe('Скоро');
  });

  it('sends voice capture to Telegram and does not claim recording in the Mini App', () => {
    const voice = CAPTURE_ACTIONS.find((action) => action.id === 'voice');

    expect(voice?.hint).toContain('Telegram');
    expect(voice?.hint).toContain('не сделана');
  });

  it('explains an unavailable action instead of leaving a dead tile', () => {
    for (const action of CAPTURE_ACTIONS) {
      if (!action.isAvailable) {
        expect(action.hint).toBeTruthy();
      }
    }
  });

  it('gives manual capture no panel — the textarea is already on screen', () => {
    expect(CAPTURE_ACTIONS.find((action) => action.id === 'manual')?.hint).toBeUndefined();
  });

  it('labels every tile with a caption naming where the capture happens', () => {
    for (const action of CAPTURE_ACTIONS) {
      expect(action.label.trim()).toBe(action.label);
      expect(action.label.length).toBeGreaterThan(0);
      expect(action.caption.length).toBeGreaterThan(0);
    }
  });
});

// Unavailability has to be readable without a disabled state: the tile stays operable, so the
// only place a screen reader can learn "Чек" does nothing yet is the accessible name.
describe('captureActionAccessibleLabel', () => {
  it('names an unavailable action unavailable and says pressing it explains why', () => {
    const scan = CAPTURE_ACTIONS.find((action) => action.id === 'scan')!;
    const label = captureActionAccessibleLabel(scan);

    expect(label).toContain('Чек');
    expect(label).toContain('недоступно');
    expect(label).toContain('Скоро');
    expect(label).toContain('Нажмите');
  });

  it('names an available action by what it does, without an unavailable marker', () => {
    const voice = CAPTURE_ACTIONS.find((action) => action.id === 'voice')!;

    expect(captureActionAccessibleLabel(voice)).toBe('Голос — В Telegram');
    expect(captureActionAccessibleLabel(voice)).not.toContain('недоступно');
  });

  it('drops the press invitation when an unavailable action has nothing to explain', () => {
    const label = captureActionAccessibleLabel({
      ...CAPTURE_ACTIONS[0],
      hint: undefined,
      badge: undefined,
    });

    expect(label).toBe('Чек — недоступно');
  });
});

describe('nextActiveCaptureAction', () => {
  it('opens the pressed action from idle', () => {
    expect(nextActiveCaptureAction(null, 'voice')).toBe('voice');
    expect(nextActiveCaptureAction(null, 'scan')).toBe('scan');
  });

  it('closes the panel when the active action is pressed again', () => {
    expect(nextActiveCaptureAction('voice', 'voice')).toBeNull();
    expect(nextActiveCaptureAction('scan', 'scan')).toBeNull();
  });

  it('switches straight between panels without an idle step', () => {
    expect(nextActiveCaptureAction('scan', 'voice')).toBe('voice');
    expect(nextActiveCaptureAction('voice', 'scan')).toBe('scan');
  });

  it('never opens a panel for manual capture', () => {
    expect(nextActiveCaptureAction(null, 'manual')).toBeNull();
    expect(nextActiveCaptureAction('voice', 'manual')).toBeNull();
    expect(nextActiveCaptureAction('scan', 'manual')).toBeNull();
  });
});

describe('captureActionHintFor', () => {
  it('returns nothing when no action is active', () => {
    expect(captureActionHintFor(null)).toBeUndefined();
  });

  it('returns the active action’s panel copy', () => {
    expect(captureActionHintFor('voice')).toBe(
      CAPTURE_ACTIONS.find((action) => action.id === 'voice')?.hint
    );
  });

  it('returns nothing for manual, so pressing it only refocuses the textarea', () => {
    expect(captureActionHintFor('manual')).toBeUndefined();
  });
});
