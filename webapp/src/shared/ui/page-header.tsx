import type { ReactNode } from 'react';
import { cn } from '@/shared/lib/utils';
import { BackButton } from './pastel/back-button';

interface PageHeaderProps {
  title: string;
  subtitle?: ReactNode;
  action?: ReactNode;
  className?: string;
}

/**
 * Standard mobile-first page header for list/overview pages.
 * Keep headings left-aligned and visually consistent across destinations.
 *
 * Every such page is nested under Home since FT-110 (no bottom bar), so the header starts with «Назад»:
 * the screen's own round button outside Telegram, nothing inside Telegram (its BackButton is used).
 */
export function PageHeader({ title, subtitle, action, className }: PageHeaderProps) {
  return (
    <div className={cn('mb-5', className)}>
      <div className="flex min-h-touch items-center gap-3">
        <BackButton />
        <h1 className="min-w-0 flex-1 text-[1.7rem] font-bold leading-tight tracking-[-0.035em] sm:text-3xl">{title}</h1>
        {action && <div className="flex-shrink-0">{action}</div>}
      </div>
      {subtitle && (
        <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground" role="status" aria-live="polite">
          {subtitle}
        </p>
      )}
    </div>
  );
}
