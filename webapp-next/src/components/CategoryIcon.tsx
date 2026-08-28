import type { ReactNode } from 'react';
import type { GlyphName } from '../lib/categories';
import { categoryGlyph } from '../lib/categories';

/**
 * Монохромные глифы вместо эмодзи из Category.icon.
 *
 * Цветные эмодзи в монохромной композиции дают тот самый визуальный шум,
 * от которого продукт уходит: каждая строка ленты получала бы собственный
 * акцентный цвет. 35 категорий делят 21 глиф.
 */
const PATHS: Record<GlyphName, ReactNode> = {
  food: <><path d="M5 3v8a3 3 0 0 0 6 0V3" /><path d="M8 11v10" /><path d="M17 3c-1.5 1.5-2 3.5-2 6 0 1.5.5 2.5 2 3v9" /></>,
  basket: <><path d="M4 8h16l-1.5 11.2a2 2 0 0 1-2 1.8H7.5a2 2 0 0 1-2-1.8Z" /><path d="M9 8V5.5a3 3 0 0 1 6 0V8" /></>,
  coffee: <><path d="M17 8h1a4 4 0 1 1 0 8h-1" /><path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4Z" /><path d="M6 2v2M10 2v2M14 2v2" /></>,
  car: <><path d="M5 17h14" /><path d="M6 17V9.5L7.8 5h8.4L18 9.5V17" /><circle cx="8" cy="17" r="2" /><circle cx="16" cy="17" r="2" /><path d="M6 10h12" /></>,
  bus: <><rect x="4" y="4" width="16" height="13" rx="2" /><path d="M4 10h16" /><path d="M7 20v-3M17 20v-3" /><circle cx="8" cy="14" r="1" /><circle cx="16" cy="14" r="1" /></>,
  fuel: <><path d="M4 20V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v15" /><path d="M3 20h12" /><path d="M14 9h3a2 2 0 0 1 2 2v6a1.5 1.5 0 0 0 3 0V9l-3-3" /></>,
  bulb: <><path d="M9 18h6" /><path d="M10 21h4" /><path d="M12 3a6 6 0 0 0-3.5 10.9c.5.4.8 1 .8 1.6V16h5.4v-.5c0-.6.3-1.2.8-1.6A6 6 0 0 0 12 3Z" /></>,
  home: <><path d="M4 10.5 12 4l8 6.5" /><path d="M6 10v9a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-9" /></>,
  wifi: <><path d="M2.5 8.5a16 16 0 0 1 19 0" /><path d="M6 12.5a10.5 10.5 0 0 1 12 0" /><path d="M9.5 16.3a5 5 0 0 1 5 0" /><circle cx="12" cy="20" r="0.6" fill="currentColor" /></>,
  bag: <><path d="M5 8h14l-1.2 11.3a2 2 0 0 1-2 1.7H8.2a2 2 0 0 1-2-1.7Z" /><path d="M9 8V6a3 3 0 0 1 6 0v2" /></>,
  gift: <><rect x="3" y="9" width="18" height="4" rx="1" /><path d="M5 13v7a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-7" /><path d="M12 9v12" /><path d="M12 9C10 9 7.5 8.5 7.5 6.5A2.5 2.5 0 0 1 12 5a2.5 2.5 0 0 1 4.5 1.5C16.5 8.5 14 9 12 9Z" /></>,
  device: <><rect x="6" y="2.5" width="12" height="19" rx="2.5" /><path d="M10.5 18.5h3" /></>,
  play: <><rect x="3" y="5" width="18" height="14" rx="2.5" /><path d="M10.5 9.5 15 12l-4.5 2.5Z" /></>,
  sport: <><circle cx="12" cy="12" r="8.5" /><path d="M12 3.5c2.5 2.2 2.5 6.3 0 8.5s-2.5 6.3 0 8.5" /><path d="M3.5 12h17" /></>,
  health: <><path d="M12 20s-7-4.4-7-9.3A4.2 4.2 0 0 1 12 7a4.2 4.2 0 0 1 7 3.7c0 4.9-7 9.3-7 9.3Z" /></>,
  book: <><path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H19v14H5.5A1.5 1.5 0 0 0 4 19.5Z" /><path d="M4 19.5A1.5 1.5 0 0 1 5.5 18H19v2.5H5.5A1.5 1.5 0 0 1 4 19.5Z" /></>,
  doc: <><path d="M6 3h8l4 4v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" /><path d="M14 3v4h4" /><path d="M8.5 12.5h7M8.5 16h5" /></>,
  money: <><rect x="3" y="6" width="18" height="12" rx="2" /><circle cx="12" cy="12" r="2.5" /><path d="M6.5 9.5h.01M17.5 14.5h.01" /></>,
  transfer: <><path d="M7 7h11l-3-3" /><path d="M17 17H6l3 3" /></>,
  debt: <><circle cx="12" cy="12" r="8.5" /><path d="M9.5 9.5a2.5 2.5 0 1 1 3.2 2.4c-.5.2-.7.6-.7 1.1v.5" /><path d="M12 17h.01" /></>,
  dot: <><circle cx="12" cy="12" r="7.5" /><path d="M12 8.5v4" /><path d="M12 15.5h.01" /></>,
};

export function CategoryIcon({ category, size = 19 }: { category: string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {PATHS[categoryGlyph(category)]}
    </svg>
  );
}
