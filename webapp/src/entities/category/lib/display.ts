import { categoryInitial, isPastelColor, pastelBgClass } from '@/shared/lib/pastel/categoryColors';

/**
 * Category marks for screens that are not yet redesigned: the first letter of the name on the
 * category's pastel colour. «Пастель» has no emoji; text on pastel is always `pastel-ink`.
 */
export function categoryMarkClass(color: string | undefined): string {
  const background = isPastelColor(color) ? pastelBgClass[color] : pastelBgClass.mist;
  return `${background} text-pastel-ink`;
}

export { categoryInitial };
