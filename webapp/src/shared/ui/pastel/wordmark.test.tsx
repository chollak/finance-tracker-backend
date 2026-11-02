import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import mark from '../../../../../docs/pastel/logo/kapelka-mark.svg?raw';
import { Wordmark } from './wordmark';

/**
 * FT-169: the sign next to «kapelka» is the bars of docs/pastel/logo/kapelka-mark.svg — the same rects, the same
 * 76×38 grid — about 20px high, in the text colour, so it follows the theme like the name does.
 */

const html = renderToStaticMarkup(<Wordmark />);
const svgOf = (markup: string) => markup.match(/<svg[^>]*>/)?.[0] ?? '';
const attribute = (tag: string, name: string) => new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.[1];
const rects = (markup: string) =>
  (markup.match(/<rect[^>]*>/g) ?? []).map((tag) =>
    ['x', 'y', 'width', 'height', 'rx'].map((name) => attribute(tag, name)).join(' ')
  );

describe('Wordmark', () => {
  it('draws the bars of the sign file, rect for rect', () => {
    expect(rects(mark)).toHaveLength(10);
    expect(rects(html)).toEqual(rects(mark));
    expect(html).not.toMatch(/<path/);
  });

  it('keeps the 76×38 grid 20px high, in the text colour', () => {
    const svg = svgOf(html);

    expect(attribute(svg, 'viewBox')).toBe('0 0 76 38');
    expect([attribute(svg, 'width'), attribute(svg, 'height')]).toEqual(['40', '20']);
    expect(attribute(svg, 'fill')).toBe('currentColor');
    expect(html.match(/fill="[^"]*"/g)).toEqual(['fill="currentColor"']);
    expect(attribute(html.match(/<span[^>]*>/)?.[0] ?? '', 'class')?.split(/\s+/)).toContain('text-ink');
  });

  it('is decoration next to the name: the name is the text', () => {
    expect(attribute(svgOf(html), 'aria-hidden')).toBe('true');
    expect(html).toMatch(/<span class="type-wordmark">kapelka<\/span>/);
  });
});
