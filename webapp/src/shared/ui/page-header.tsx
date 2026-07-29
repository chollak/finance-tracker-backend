import type { ReactNode } from 'react';
import { cn } from '@/shared/lib/utils';

interface PageHeaderProps {
  title: string;
  subtitle?: ReactNode;
  action?: ReactNode;
  className?: string;
}

/**
 * Standard mobile-first page header for list/overview pages.
 * Keep headings left-aligned and visually consistent across tab destinations.
 */
export function PageHeader({ title, subtitle, action, className }: PageHeaderProps) {
  return (
    <div className={cn('mb-5 flex items-start justify-between gap-4', className)}>
      <div className="min-w-0 flex-1">
        <h1 className="text-[1.7rem] font-bold leading-tight tracking-[-0.035em] sm:text-3xl">{title}</h1>
        {subtitle && (
          <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground" role="status" aria-live="polite">
            {subtitle}
          </p>
        )}
      </div>
      {action && <div className="flex-shrink-0">{action}</div>}
    </div>
  );
}
