import { cn } from '@/shared/lib/utils';

/**
 * The Kapelka sign and name (design-system «Знак», FT-169): two drops of different size joined at their tips into
 * «∞», drawn with the bars of a voice message, and «kapelka» in lower case in `wordmark` type. The bars are
 * `docs/pastel/logo/kapelka-mark.svg` as is, 20px high, in the text colour.
 */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn('flex items-center gap-2.5 text-ink', className)}>
      <svg width="40" height="20" viewBox="0 0 76 38" fill="currentColor" aria-hidden="true" className="shrink-0">
        <rect x="1.2" y="10.56" width="5.2" height="16.87" rx="2.6" />
        <rect x="8.8" y="3.03" width="5.2" height="31.94" rx="2.6" />
        <rect x="16.4" y="1.01" width="5.2" height="35.97" rx="2.6" />
        <rect x="24" y="2.13" width="5.2" height="33.75" rx="2.6" />
        <rect x="31.6" y="6.03" width="5.2" height="25.93" rx="2.6" />
        <rect x="39.2" y="12.42" width="5.2" height="13.16" rx="2.6" />
        <rect x="46.8" y="16.4" width="5.2" height="5.2" rx="2.6" />
        <rect x="54.4" y="12.46" width="5.2" height="13.09" rx="2.6" />
        <rect x="62" y="9.51" width="5.2" height="18.98" rx="2.6" />
        <rect x="69.6" y="12.72" width="5.2" height="12.57" rx="2.6" />
      </svg>
      <span className="type-wordmark">kapelka</span>
    </span>
  );
}
