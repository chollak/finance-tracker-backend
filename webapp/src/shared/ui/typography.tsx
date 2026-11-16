import type { ReactNode } from 'react';
import { cn } from '@/shared/lib/utils';

interface PageShellProps {
  children: ReactNode;
  className?: string;
  as?: 'div' | 'main';
}

/** The page's column. `space-6` (24px) at the bottom of the screen, above the system zone the app shell keeps. */
export function PageShell({ children, className, as: Component = 'div' }: PageShellProps) {
  return (
    <Component className={cn('mx-auto w-full max-w-3xl px-4 pt-5 pb-6 md:pt-6', className)}>
      {children}
    </Component>
  );
}
