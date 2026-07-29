import type { ReactNode } from 'react';
import { cn } from '@/shared/lib/utils';
import { formatAmount } from '@/shared/lib/formatters';

export type Tone = 'default' | 'muted' | 'income' | 'expense' | 'warning' | 'success';

const toneTextClass: Record<Tone, string> = {
  default: 'text-foreground',
  muted: 'text-muted-foreground',
  income: 'text-income',
  expense: 'text-expense',
  warning: 'text-warning',
  success: 'text-success',
};

interface PageShellProps {
  children: ReactNode;
  className?: string;
  as?: 'div' | 'main';
}

export function PageShell({ children, className, as: Component = 'div' }: PageShellProps) {
  return (
    <Component className={cn('mx-auto w-full max-w-3xl px-4 py-5 md:py-6', className)}>
      {children}
    </Component>
  );
}

export function SectionStack({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('space-y-4 md:space-y-5', className)}>{children}</div>;
}

interface AmountTextProps {
  amount: number;
  tone?: Tone;
  size?: 'display' | 'lg' | 'md' | 'sm';
  showPlus?: boolean;
  className?: string;
}

const amountSizeClass: Record<NonNullable<AmountTextProps['size']>, string> = {
  display: 'text-[2.35rem] leading-none sm:text-5xl',
  lg: 'text-2xl leading-tight sm:text-3xl',
  md: 'text-lg leading-snug sm:text-xl',
  sm: 'text-sm leading-snug',
};

export function AmountText({
  amount,
  tone = 'default',
  size = 'md',
  showPlus = false,
  className,
}: AmountTextProps) {
  const prefix = showPlus && amount > 0 ? '+' : '';

  return (
    <span
      className={cn(
        'inline-flex max-w-full flex-wrap items-baseline gap-x-1.5 font-bold tracking-[-0.035em] tabular-nums',
        amountSizeClass[size],
        toneTextClass[tone],
        className
      )}
    >
      <span className="min-w-0 break-all">{prefix}{formatAmount(amount)}</span>
      <span className={cn('font-semibold tracking-normal text-current/70', size === 'display' ? 'text-base' : 'text-xs')}>
        UZS
      </span>
    </span>
  );
}

interface MetricStatProps {
  label: string;
  amount: number;
  tone?: Tone;
  className?: string;
}

export function MetricStat({ label, amount, tone = 'default', className }: MetricStatProps) {
  return (
    <div className={cn('rounded-2xl bg-muted/55 px-3.5 py-3', className)}>
      <p className="text-xs font-medium leading-none text-muted-foreground">{label}</p>
      <div className="mt-2">
        <AmountText amount={amount} tone={tone} size="md" />
      </div>
    </div>
  );
}
