import { Progress } from '@/shared/ui/progress';
import { cn } from '@/shared/lib/utils';
import type { ReactNode } from 'react';

interface UsageBarProps {
  label: string;
  used: number;
  limit: number | null;
  icon: ReactNode;
}

/**
 * Progress bar showing usage vs limit
 * Returns null for premium users (limit === null)
 */
export function UsageBar({ label, used, limit, icon }: UsageBarProps) {
  // Don't show for premium users
  if (limit === null) return null;

  const percentage = Math.min((used / limit) * 100, 100);
  const isWarning = percentage >= 80;
  const isExceeded = percentage >= 100;

  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-sm">
        <span className="text-muted-foreground flex items-center gap-1.5">
          <span
            className={cn(
              'w-5 h-5 rounded-md flex items-center justify-center',
              isExceeded && 'bg-expense/10 text-expense',
              isWarning && !isExceeded && 'bg-amber-500/10 text-amber-500',
              !isWarning && 'bg-muted text-muted-foreground'
            )}
          >
            {icon}
          </span>
          {label}
        </span>
        <span
          className={cn(
            'font-medium',
            isExceeded && 'text-expense',
            isWarning && !isExceeded && 'text-amber-500'
          )}
        >
          {used}/{limit}
        </span>
      </div>
      <Progress
        value={percentage}
        className={cn(
          'h-2',
          isExceeded && 'bg-expense/20',
          isWarning && !isExceeded && 'bg-amber-500/20'
        )}
        indicatorClassName={cn(
          isExceeded && 'bg-expense',
          isWarning && !isExceeded && 'bg-amber-500',
          !isWarning && 'bg-primary'
        )}
      />
    </div>
  );
}
