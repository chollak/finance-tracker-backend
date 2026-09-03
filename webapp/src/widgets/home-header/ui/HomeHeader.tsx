import { cn } from '@/shared/lib/utils';
import { useUserStore } from '@/entities/user/model/store';
import {
  formatHomeHeaderDate,
  getCaptureChannelStatus,
  type CaptureChannelTone,
} from '../lib/homeHeaderModel';

const DOT_TONE_CLASS: Record<CaptureChannelTone, string> = {
  connected: 'bg-success',
  local: 'bg-warning',
  unknown: 'bg-muted-foreground',
};

/**
 * Home header for the capture-first Home.
 *
 * Replaces the generic "Главная / Обзор ваших финансов" page header: on a
 * quick-capture screen the useful context is today's date and where the capture
 * will be saved, not a restatement of the tab name.
 */
export function HomeHeader({ className }: { className?: string }) {
  const userType = useUserStore((state) => state.userType);

  const { day, weekday } = formatHomeHeaderDate(new Date());
  const status = getCaptureChannelStatus(userType);

  return (
    <div className={cn('mb-4 flex items-center justify-between gap-3', className)}>
      <div className="min-w-0">
        <h1 className="text-[1.35rem] font-bold leading-tight tracking-[-0.03em] sm:text-2xl">
          {day}
        </h1>
        <p className="mt-0.5 text-sm capitalize leading-relaxed text-muted-foreground">{weekday}</p>
      </div>

      <span className="inline-flex shrink-0 items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground">
        <span
          className={cn('h-1.5 w-1.5 rounded-full', DOT_TONE_CLASS[status.tone])}
          aria-hidden="true"
        />
        {status.label}
      </span>
    </div>
  );
}
