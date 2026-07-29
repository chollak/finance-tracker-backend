import type { ReactNode } from 'react';
import { ArrowLeft } from 'lucide-react';
import { Button } from './button';
import { cn } from '@/shared/lib/utils';

interface FormPageHeaderProps {
  title: string;
  subtitle?: ReactNode;
  onBack: () => void;
  action?: ReactNode;
  className?: string;
}

/**
 * Standard header for form/detail pages that sit outside the bottom-nav layout.
 */
export function FormPageHeader({ title, subtitle, onBack, action, className }: FormPageHeaderProps) {
  return (
    <div className={cn('mb-6 flex items-start gap-4', className)}>
      <Button
        variant="ghost"
        size="icon"
        onClick={onBack}
        aria-label="Назад"
        className="-ml-2 mt-0.5 flex-shrink-0"
      >
        <ArrowLeft className="h-5 w-5" aria-hidden="true" />
      </Button>
      <div className="min-w-0 flex-1">
        <h1 className="text-[1.7rem] font-bold leading-tight tracking-[-0.035em] sm:text-3xl">{title}</h1>
        {subtitle && <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{subtitle}</p>}
      </div>
      {action && <div className="flex-shrink-0">{action}</div>}
    </div>
  );
}
