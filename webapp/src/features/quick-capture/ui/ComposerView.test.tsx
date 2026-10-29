import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { NBSP } from '@/shared/lib/money';
import { ROUTES } from '@/shared/lib/constants/routes';
import type { QuickChip } from '../model/quickChips';
import { ComposerView, type ComposerViewProps } from './ComposerView';

/**
 * FT-114, board «Главная» and Composer.md: the composer at the bottom of Home — the quick chips, the field
 * with the camera and «Ввести вручную» inside it, and the round button: the microphone while the field is
 * empty, the send arrow once there is text. Rendered to static markup (no DOM).
 */

const CHIPS: QuickChip[] = [
  {
    key: 'c1', name: 'Кофе', amount: `25${NBSP}000`, color: 'rose', aria: `Записать сразу: Кофе, 25${NBSP}000 сум`,
    record: { categoryId: 'c-cafe', categoryName: 'Кафе', note: 'Кофе', amountMinor: 2_500_000, currency: 'UZS' },
  },
  {
    key: 'c2', name: 'Такси', amount: `18${NBSP}000`, color: 'sky', aria: `Записать сразу: Такси, 18${NBSP}000 сум`,
    record: { categoryId: 'c-tr', categoryName: 'Транспорт', note: 'Такси', amountMinor: 1_800_000, currency: 'UZS' },
  },
];

const noop = () => {};

function view(props: Partial<ComposerViewProps> = {}): string {
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={[ROUTES.HOME]}>
      <ComposerView
        chips={CHIPS}
        text=""
        sending={false}
        onText={noop}
        onSend={noop}
        onChip={noop}
        onVoice={noop}
        onCamera={noop}
        {...props}
      />
    </MemoryRouter>
  );
}

const buttons = (html: string) => [...html.matchAll(/<button [^>]*>.*?<\/button>/g)].map((match) => match[0]);

describe('the composer', () => {
  it('is the quick input region at the bottom of the screen on the screen’s background', () => {
    const html = view();

    expect(html).toMatch(/<div[^>]*role="region"[^>]*aria-label="Быстрый ввод"/);
    expect(html).toMatch(/aria-label="Быстрый ввод"[^>]*class="[^"]*fixed[^"]*bottom-0[^"]*bg-bg/);
  });
});

describe('the quick chips', () => {
  it('are pills in the colour of their category with the name and the amount, and say what a tap does', () => {
    const chip = buttons(view()).find((tag) => tag.includes('Кофе'));

    expect(view()).toMatch(/role="group" aria-label="Частые операции"/);
    expect(chip).toContain(`aria-label="Записать сразу: Кофе, 25${NBSP}000 сум"`);
    expect(chip).toMatch(/h-touch/);
    expect(chip).toMatch(/rounded-pill/);
    expect(chip).toMatch(/bg-pastel-rose/);
    expect(chip).toMatch(/text-pastel-ink/);
    expect(chip).toMatch(new RegExp(`>Кофе</span><span[^>]*>25${NBSP}000</span>`));
  });

  it('scroll sideways in one row', () => {
    expect(view()).toMatch(/aria-label="Частые операции"[^>]*class="[^"]*overflow-x-auto/);
  });

  it('leave no empty row when there are none yet', () => {
    expect(view({ chips: [] })).not.toContain('Частые операции');
  });
});

describe('the field', () => {
  it('is a 56px pill on the card with the example as its hint and a name for screen readers', () => {
    const html = view();

    expect(html).toMatch(/class="[^"]*h-button[^"]*rounded-pill[^"]*bg-card/);
    expect(html).toMatch(/<input[^>]*placeholder="Кофе 25к, такси 18к…"/);
    expect(html).toMatch(/<span class="sr-only">Новая запись текстом<\/span>/);
  });

  it('has the camera and «Ввести вручную» inside, 44px each; manual entry opens /add', () => {
    const html = view();

    expect(buttons(html).find((tag) => tag.includes('aria-label="Фото чека"'))).toMatch(/size-touch/);
    const manual = [...html.matchAll(/<a [^>]*>/g)].map((match) => match[0]).find((tag) => tag.includes(`href="${ROUTES.MANUAL_ENTRY}"`));
    expect(manual).toMatch(/aria-label="Ввести вручную"/);
    expect(manual).toMatch(/size-touch/);
  });
});

describe('the round button', () => {
  it('is the microphone while the field is empty', () => {
    const round = buttons(view()).find((tag) => tag.includes('size-button'));

    expect(round).toMatch(/aria-label="Голосовой ввод"/);
    expect(round).toMatch(/bg-primary/);
  });

  it('becomes the send arrow once there is text (blank does not count)', () => {
    expect(buttons(view({ text: '   ' })).find((tag) => tag.includes('size-button'))).toMatch(/aria-label="Голосовой ввод"/);
    expect(buttons(view({ text: 'такси 18к' })).find((tag) => tag.includes('size-button'))).toMatch(/aria-label="Распознать текст"/);
  });

  it('waits while the text is being read, and the field keeps the text', () => {
    const html = view({ text: 'такси 18к', sending: true });
    const round = buttons(html).find((tag) => tag.includes('size-button'));

    expect(round).toMatch(/disabled=""/);
    expect(round).toMatch(/aria-busy="true"/);
    expect(html).toMatch(/<input[^>]*value="такси 18к"/);
  });
});

/**
 * FT-146: after a send nothing seemed to happen — the field went read-only and the round button grey. While the phrase
 * is read the field says «Распознаю…» (the word of the board «Голосовой ввод») in a live region, and the round button
 * stays the main one with three pulsing dots: it is busy with the phrase, not missing something.
 */
describe('while the phrase is being read (FT-146)', () => {
  const STATUS = /<span[^>]*role="status"[^>]*aria-live="polite"[^>]*>(.*?)<\/span>/;

  it('the field says «Распознаю…» in a live region', () => {
    const html = view({ text: 'такси 18к', sending: true });

    expect(html.match(STATUS)?.[1]).toBe('Распознаю…');
  });

  it('the live region is there before the send and silent, so the change is announced', () => {
    const html = view({ text: 'такси 18к' });

    expect(html).toMatch(STATUS);
    expect(html.match(STATUS)?.[1]).toBe('');
  });

  it('the round button says «Распознаю…» to a screen reader while it waits', () => {
    const round = buttons(view({ text: 'такси 18к', sending: true })).find((tag) => tag.includes('size-button'));

    expect(round).toContain('aria-label="Распознаю…"');
  });

  it('a long phrase ends with an ellipsis, a clear gap before «Распознаю…»', () => {
    const html = view({ text: 'обед в центре с коллегами 145к и такси домой 32к', sending: true });

    expect(html).toMatch(/<input[^>]*class="[^"]*truncate/);
    expect(html).toMatch(/<span[^>]*role="status"[^>]*class="[^"]*pl-2/);
  });

  it('the round button stays the main one, with pulsing dots instead of the arrow', () => {
    const round = buttons(view({ text: 'такси 18к', sending: true })).find((tag) => tag.includes('size-button'));

    expect(round).toMatch(/disabled:bg-primary/);
    expect(round).toMatch(/disabled:text-on-primary/);
    expect(round).toContain('motion-safe:animate-waiting-pulse');
    expect(round).not.toContain('M10 16V4');
  });

  it('the camera and «Ввести вручную» step aside for the words, and come back after', () => {
    const sending = view({ text: 'такси 18к', sending: true });
    const idle = view({ text: 'такси 18к' });

    expect(sending).not.toContain('aria-label="Фото чека"');
    expect(sending).not.toContain('aria-label="Ввести вручную"');
    expect(idle).toContain('aria-label="Фото чека"');
    expect(idle).toContain('aria-label="Ввести вручную"');
  });

  it('the phrase stays the user’s own: `ink`, not grey', () => {
    expect(view({ text: 'такси 18к', sending: true })).toMatch(/<input[^>]*class="[^"]*text-ink(?!-)/);
  });
});

/**
 * FT-129, board «Главная без связи»: without a connection the microphone is a `track` circle with `ink`, not the main
 * button, and says it does not work; the send arrow writes on the device.
 */
describe('the composer without a connection', () => {
  it('draws the microphone on `track` and says it does not work', () => {
    const mic = buttons(view({ offline: true })).find((tag) => tag.includes('Голосовой ввод'));

    expect(mic).toContain('aria-label="Голосовой ввод — без связи не работает"');
    expect(mic).toMatch(/class="[^"]*bg-track[^"]*text-ink/);
    expect(mic).not.toMatch(/bg-primary/);
  });

  it('the send arrow says it writes without a connection', () => {
    const send = buttons(view({ offline: true, text: 'такси 18к' })).find((tag) => tag.includes('type="submit"'));

    expect(send).toContain('aria-label="Записать без связи"');
  });

  it('online the microphone stays the main button', () => {
    const mic = buttons(view()).find((tag) => tag.includes('Голосовой ввод'));

    expect(mic).toContain('aria-label="Голосовой ввод"');
    expect(mic).toMatch(/bg-primary/);
  });
});
