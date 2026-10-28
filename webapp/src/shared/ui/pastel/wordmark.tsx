import { cn } from '@/shared/lib/utils';

/**
 * The kapelka sign and name (design-system «Знак»): a rounded `ink` square with three lines of different
 * length cut out of it — a ledger page — and «kapelka» in lower case in `wordmark` type. No logo file yet:
 * the sign is inline SVG in the text colour.
 */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn('flex items-center gap-2.5 text-ink', className)}>
      <svg width="30" height="30" viewBox="0 0 24 24" aria-hidden="true" className="shrink-0">
        <path
          fill="currentColor"
          fillRule="evenodd"
          d="M7 0h10a7 7 0 0 1 7 7v10a7 7 0 0 1-7 7H7a7 7 0 0 1-7-7V7a7 7 0 0 1 7-7ZM6 7v2h12V7H6Zm0 4v2h8v-2H6Zm0 4v2h10v-2H6Z"
        />
      </svg>
      <span className="type-wordmark">kapelka</span>
    </span>
  );
}
