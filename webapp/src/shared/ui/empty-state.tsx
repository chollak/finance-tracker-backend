import type { ReactNode } from 'react';
import { cn } from '@/shared/lib';

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  tip?: string;
  action?: ReactNode;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

/**
 * Enhanced empty state component with helpful messaging
 */
export function EmptyState({
  icon,
  title,
  description,
  tip,
  action,
  className,
  size = 'md',
}: EmptyStateProps) {
  const sizeClasses = {
    sm: 'py-6',
    md: 'py-10',
    lg: 'py-16',
  };

  const iconSizeClasses = {
    sm: 'text-3xl',
    md: 'text-4xl',
    lg: 'text-5xl',
  };

  const titleSizeClasses = {
    sm: 'text-sm',
    md: 'text-base',
    lg: 'text-lg',
  };

  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center',
        sizeClasses[size],
        className
      )}
    >
      {icon && (
        <div className={cn('mb-3 opacity-60', iconSizeClasses[size])}>
          {icon}
        </div>
      )}

      <h3 className={cn('font-medium text-foreground mb-1', titleSizeClasses[size])}>
        {title}
      </h3>

      {description && (
        <p className="text-sm text-muted-foreground max-w-xs mb-3">
          {description}
        </p>
      )}

      {tip && (
        <p className="text-xs text-muted-foreground/70 max-w-xs mb-4 italic">
          💡 {tip}
        </p>
      )}

      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
