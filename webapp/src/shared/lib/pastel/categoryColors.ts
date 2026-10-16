/**
 * The eight pastel colours of «Пастель» categories. Pastel is only ever a background; text on it is
 * always `pastel-ink`, in both themes. Class names are spelled out so Tailwind finds them.
 */
export const PASTEL_COLORS = ['peach', 'rose', 'sky', 'sand', 'lilac', 'mint', 'butter', 'mist'] as const;
export type PastelColor = (typeof PASTEL_COLORS)[number];

export const pastelBgClass: Record<PastelColor, string> = {
  peach: 'bg-pastel-peach',
  rose: 'bg-pastel-rose',
  sky: 'bg-pastel-sky',
  sand: 'bg-pastel-sand',
  lilac: 'bg-pastel-lilac',
  mint: 'bg-pastel-mint',
  butter: 'bg-pastel-butter',
  mist: 'bg-pastel-mist',
};

export function isPastelColor(value: unknown): value is PastelColor {
  return typeof value === 'string' && (PASTEL_COLORS as readonly string[]).includes(value);
}

/** Categories are marked by colour and the first letter of the name — no emoji, no icons. */
export function categoryInitial(name: string): string {
  const letter = [...name.trim()].find((char) => /\p{L}|\p{N}/u.test(char));
  return letter ? letter.toLocaleUpperCase('ru-RU') : '·';
}
