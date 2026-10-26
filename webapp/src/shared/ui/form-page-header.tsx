import type { ReactNode } from 'react';
import { cn } from '@/shared/lib/utils';
import { BackButton } from './pastel/back-button';

interface FormPageHeaderProps {
  title: string;
  subtitle?: ReactNode;
  action?: ReactNode;
  className?: string;
}

/**
 * Standard header for form/detail pages. «Назад» is the app's one back (FT-110): the previous app screen,
 * or the parent one when the page was opened by a link from the bot; inside Telegram the header leaves it
 * to Telegram's BackButton.
 */
export function FormPageHeader({ title, subtitle, action, className }: FormPageHeaderProps) {
  return (
    <div className={cn('mb-6', className)}>
      <div className="flex min-h-touch items-center gap-3">
        <BackButton />
        <h1 className="min-w-0 flex-1 text-[1.7rem] font-bold leading-tight tracking-[-0.035em] sm:text-3xl">{title}</h1>
        {action && <div className="flex-shrink-0">{action}</div>}
      </div>
      {subtitle && <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{subtitle}</p>}
    </div>
  );
}
