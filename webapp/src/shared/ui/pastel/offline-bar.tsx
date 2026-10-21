import { cn } from '@/shared/lib/utils';

/** The «нет сети» icon of the boards (20px, line 1.8). */
export function NoNetworkIcon({ className }: { className?: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true" className={cn('shrink-0', className)}>
      <path
        d="M2.5 7.5a11 11 0 0 1 4-2.4M17.5 7.5a11 11 0 0 0-6.3-3M5 10.5a7 7 0 0 1 3-1.8M15 10.5a7 7 0 0 0-1.6-1.1M7.6 13.4a3.5 3.5 0 0 1 4.8 0M10 16.5h.01M3 3l14 14"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

/**
 * How Home says there is no connection (docs/pastel/components/OfflineBar.md, board «Главная без связи»): a `card`
 * line under the header, at least 48px, with the «нет сети» icon and one sentence. Nothing else is explained here — voice
 * and receipts say it on their own screens. `role="status"`, so a screen reader announces it when it appears.
 */
export function OfflineBar({ className }: { className?: string }) {
  return (
    <div
      role="status"
      className={cn('flex min-h-key items-center gap-2.5 rounded-card bg-card px-4 py-2.5 text-ink', className)}
    >
      <NoNetworkIcon />
      <span className="text-[14px] font-bold leading-[1.4]">Нет связи — записи сохранятся и отправятся сами</span>
    </div>
  );
}
