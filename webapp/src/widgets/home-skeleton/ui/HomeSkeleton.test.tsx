import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { HomeSkeletonView } from './HomeSkeleton';

/**
 * FT-112, boards «Загрузка», «Загрузка дольше обычного», «Загрузка · тёмная» and Skeleton.md: Home opens
 * on grey shapes of its own layout — no spinner in the middle — and after six seconds says the loading is
 * slow and offers to try again. Rendered to static markup (no DOM).
 */

const view = (slow: boolean) => renderToStaticMarkup(<HomeSkeletonView slow={slow} onRetry={() => {}} />);
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
const RETRY = /<button[^>]*>Попробовать снова<\/button>/;

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
    // The tiles keep the corners of the real ones (24px), not a pill
    expect(html.match(/class="[^"]*rounded-card[^"]*h-\[82px\]/g)).toHaveLength(2);
    expect(html.match(/<li[\s>]/g)).toHaveLength(4);
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
});
