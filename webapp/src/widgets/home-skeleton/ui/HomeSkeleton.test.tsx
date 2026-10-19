import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { signInForStaticRender } from '@/entities/user/model/staticRenderUser';
import { homeLoadingClock, SLOW_LOADING_AFTER_MS } from '../model/slowLoading';
import { HomeSkeleton, HomeSkeletonView } from './HomeSkeleton';

/**
 * FT-112, boards «Загрузка», «Загрузка дольше обычного», «Загрузка · тёмная» and Skeleton.md: Home opens
 * on grey shapes of its own layout — no spinner in the middle — and after six seconds says the loading is
 * slow and offers to try again. Rendered to static markup (no DOM).
 */

const view = (slow: boolean) => renderToStaticMarkup(<HomeSkeletonView slow={slow} onRetry={() => {}} />);
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
const RETRY = /<button[^>]*>Попробовать снова<\/button>/;

/** The markup inside the `aria-busy` container (a div), up to its closing tag. */
function busyRegion(html: string): string {
  const start = html.indexOf('aria-busy="true"');
  const tags = /<div[\s>]|<\/div>/g;
  tags.lastIndex = start;
  let depth = 1;
  for (let tag = tags.exec(html); tag; tag = tags.exec(html)) {
    depth += tag[0] === '</div>' ? -1 : 1;
    if (depth === 0) return html.slice(start, tag.index);
  }
  throw new Error('the busy container is not closed');
}

/** Every class list in the markup that animates something. */
const animated = (html: string) =>
  [...html.matchAll(/class="([^"]*)"/g)].map((match) => match[1]).filter((classes) => /animate-/.test(classes));

describe('Home while it loads', () => {
  it('is busy and tells a screen reader what it loads', () => {
    const html = view(false);

    expect(html).toMatch(/aria-busy="true"/);
    expect(html).toMatch(/<p[^>]*role="status"[^>]*>Загружаю ваши счета и записи<\/p>/);
    expect(text(html)).toContain('Загружаю ваши счета и записи…');
  });

  it('has the real header with the daftar sign', () => {
    expect(view(false)).toMatch(/<header[^>]*>.*daftar.*<\/header>/);
  });

  it('draws the balance card, the two month tiles and the list of records as shapes', () => {
    const html = view(false);

    // The balance card keeps the colour of the real one: `primary`, its stripes `hero-track`
    expect(html).toMatch(/rounded-hero bg-primary/);
    expect(html).toMatch(/bg-hero-track/);
    // The tiles keep the corners of the real ones (24px), not a pill, and their height (80px)
    expect(html.match(/class="[^"]*rounded-card[^"]*h-20"/g)).toHaveLength(2);
    expect(html.match(/<li[\s>]/g)).toHaveLength(4);
  });

  it('has no capture card between the tiles and the records: Home has the composer at the bottom (FT-114)', () => {
    expect(view(false)).not.toMatch(/h-\[308px\]/);
  });

  it('draws the composer at the bottom as Home has it: three chips, the field and the round button', () => {
    const html = view(false);
    const bottom = html.slice(html.indexOf('Загружаю ваши счета и записи…'));

    expect(bottom.match(/class="[^"]*h-touch w-\[104px\][^"]*"/g)).toHaveLength(3);
    expect(bottom).toMatch(/class="[^"]*h-button[^"]*rounded-pill bg-card/);
    expect(bottom).toMatch(/class="[^"]*size-button/);
  });

  it('puts the records where Home puts them: under a heading row and a day line', () => {
    const html = view(false);

    expect(html).toMatch(/<span class="flex h-touch items-center"><span[^>]*h-5 w-\[200px\]/);
    expect(html).toMatch(/<span class="flex h-\[18px\] items-center">.*?<\/span><\/span><ul/);
  });

  it('says it is loading under the shapes in the label style', () => {
    expect(view(false)).toMatch(/<p[^>]*class="type-label[^"]*text-ink-muted"[^>]*>Загружаю ваши счета и записи…<\/p>/);
  });

  it('keeps the status line out of the busy shapes, so a screen reader announces it', () => {
    const html = view(false);

    expect(html).toMatch(/role="status"/);
    expect(busyRegion(html)).toContain('daftar');
    expect(busyRegion(html)).not.toMatch(/role="status"/);
  });

  it('has no spinner in the middle', () => {
    const html = view(false);

    expect(html).not.toMatch(/animate-spin/);
    expect(text(html)).not.toContain('Загрузка...');
  });

  it('pulses only while the system allows motion: under prefers-reduced-motion the shapes stand still', () => {
    const classes = animated(view(false));

    expect(classes.length).toBeGreaterThan(0);
    // `motion-safe:` is @media (prefers-reduced-motion: no-preference)
    for (const list of classes) {
      expect(list.split(/\s+/).filter((name) => name.includes('animate-'))).toEqual(['motion-safe:animate-pastel-pulse']);
    }
  });

  it('offers nothing to press before the six seconds are up', () => {
    expect(view(false)).not.toMatch(/<(button|a)[\s>]/);
  });
});

describe('Home that loads longer than usual', () => {
  it('says the connection seems weak and the records are safe on the server', () => {
    const html = view(true);

    expect(text(html)).toContain('Дольше обычного — похоже, слабая связь. Записи не пропадут: они хранятся на сервере.');
    expect(html).toMatch(/<p[^>]*role="status"[^>]*>Загрузка идёт дольше обычного\. Проверьте связь — записи не потеряются\.<\/p>/);
    expect(html).toMatch(/aria-busy="true"/);
  });

  it('keeps the message and the button out of the busy shapes, so they are announced and can be pressed', () => {
    const region = busyRegion(view(true));

    expect(region).not.toContain('Попробовать снова');
    expect(region).not.toContain('Дольше обычного');
  });

  it('offers «Попробовать снова» as the main full-width button', () => {
    const button = view(true).match(RETRY)?.[0];

    expect(button).toBeDefined();
    expect(button).toMatch(/h-button/);
    expect(button).toMatch(/w-full/);
  });

  it('leaves «Записывать без связи» to the offline mode (FT-129)', () => {
    expect(text(view(true))).not.toContain('Записывать без связи');
  });

  it('shortens the list so the message and the button fit', () => {
    expect(view(true).match(/<li[\s>]/g)).toHaveLength(3);
  });

  it('puts the message and the button in the composer’s place', () => {
    const html = view(true);

    expect(html).not.toMatch(/w-\[104px\]/);
    expect(html).not.toMatch(/size-button/);
  });
});

describe('the slow message of a loading that has taken six seconds', () => {
  let signOut = () => {};
  const T0 = new Date('2026-10-19T09:00:00Z').getTime();

  /** HomeSkeleton as it renders once the shared clock of Home's loading has counted six seconds. */
  function sixSecondsLater(): string {
    vi.useFakeTimers({ now: T0 });
    homeLoadingClock.show();
    vi.setSystemTime(T0 + SLOW_LOADING_AFTER_MS);
    const client = new QueryClient();
    return renderToStaticMarkup(
      <QueryClientProvider client={client}>
        <HomeSkeleton />
      </QueryClientProvider>
    );
  }

  afterEach(async () => {
    homeLoadingClock.hide();
    await Promise.resolve();
    vi.useRealTimers();
    signOut();
  });

  it('comes to a Telegram user: their records are kept on the server', () => {
    signOut = signInForStaticRender({ userId: '900000001', userType: 'telegram' });

    const html = sixSecondsLater();

    expect(text(html)).toContain('Записи не пропадут: они хранятся на сервере.');
    expect(html).toMatch(RETRY);
  });

  it('does not come to a guest: their records are on the device, and the server would be a false promise', () => {
    signOut = signInForStaticRender({ userId: 'guest_1', userType: 'guest' });

    const html = sixSecondsLater();

    expect(text(html)).not.toContain('хранятся на сервере');
    expect(html).not.toMatch(RETRY);
    expect(text(html)).toContain('Загружаю ваши счета и записи…');
  });

  it('does not come while it is not known yet who the user is: they may turn out to be a guest', () => {
    const html = sixSecondsLater();

    expect(text(html)).not.toContain('хранятся на сервере');
    expect(html).not.toMatch(RETRY);
  });
});
