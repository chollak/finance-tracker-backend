import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { SkeletonBlock } from './skeleton-block';

/**
 * Skeleton.md: grey shapes copy the real layout — stripes and circles are pills, a tile keeps the card's
 * corners. `cn` does not know the Pastel radius names, so a radius in `className` would not replace the
 * pill; the shape is a prop instead.
 */

const classes = (html: string) => html.match(/class="([^"]*)"/)?.[1].split(/\s+/) ?? [];

describe('SkeletonBlock', () => {
  it('is a pill by default', () => {
    expect(classes(renderToStaticMarkup(<SkeletonBlock className="h-3 w-16" />))).toContain('rounded-pill');
  });

  it.each([
    ['tile', 'rounded-tile'],
    ['card', 'rounded-card'],
  ] as const)('takes the %s radius instead of the pill', (radius, token) => {
    const list = classes(renderToStaticMarkup(<SkeletonBlock radius={radius} className="h-[82px]" />));

    expect(list).toContain(token);
    expect(list).not.toContain('rounded-pill');
  });

  it('pulses only while the system allows motion', () => {
    expect(classes(renderToStaticMarkup(<SkeletonBlock />)).filter((name) => name.includes('animate-'))).toEqual([
      'motion-safe:animate-pastel-pulse',
    ]);
  });
});
