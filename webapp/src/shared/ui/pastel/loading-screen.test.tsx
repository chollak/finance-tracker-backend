import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { LoadingScreen } from './loading-screen';

/**
 * #290: while a screen's code loads or the app reads the user and the settings, a screen other than Home is the
 * theme's background and the Kapelka sign where the login and the first launch draw it — the login's frame while it
 * first asks about the login (FT-128). No spinner and no «Загрузка» (Skeleton.md).
 */

const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const busyRegion = (html: string) => html.match(/<div aria-busy="true"[^>]*>(.*?)<\/div>/)?.[1] ?? '';

describe('LoadingScreen', () => {
  it('is the theme’s background over the whole screen', () => {
    const outer = renderToStaticMarkup(<LoadingScreen />).match(/^<div class="([^"]*)"/)?.[1].split(/\s+/) ?? [];

    expect(outer).toEqual(expect.arrayContaining(['bg-bg', 'min-h-dvh', 'px-4', 'pt-2']));
  });

  it('draws the Kapelka sign in the 48px header row, as the login does', () => {
    const html = renderToStaticMarkup(<LoadingScreen />);

    expect(busyRegion(html)).toContain('kapelka');
    expect(html).toMatch(/<div aria-busy="true" class="flex h-key items-center">/);
  });

  it('tells a screen reader what is going on, outside the busy frame so it is announced', () => {
    const html = renderToStaticMarkup(<LoadingScreen />);

    expect(html).toMatch(/<p role="status" class="sr-only">Открываю Kapelka<\/p>/);
    expect(busyRegion(html)).not.toMatch(/role="status"/);
  });

  it('has no spinner and no «Загрузка»', () => {
    const html = renderToStaticMarkup(<LoadingScreen />);

    expect(html).not.toMatch(/animate-spin/);
    expect(text(html)).not.toMatch(/Загрузка/);
  });

  it('offers nothing to press', () => {
    expect(renderToStaticMarkup(<LoadingScreen />)).not.toMatch(/<(button|a)[\s>]/);
  });

  it('fits in a card of the showcase without taking the whole screen', () => {
    expect(renderToStaticMarkup(<LoadingScreen fullScreen={false} />)).not.toContain('min-h-dvh');
  });
});
