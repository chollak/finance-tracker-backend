import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/shared/lib/utils';

/**
 * Buttons of «Пастель» (docs/pastel/components/Button.md).
 * - primary: one per screen, full width, 56px. When disabled its label says what is missing.
 * - round: 56×56 primary circle (microphone, send).
 * - round-secondary: 44×44 on track (manual entry, «Назад»).
 * - text: underlined 14px/800, 44px tall («Отменить» in a toast).
 * Icon-only buttons need an aria-label.
 */
const buttonVariants = cva(
  'inline-flex shrink-0 items-center justify-center gap-2 transition-[transform,background-color,color] duration-150 ' +
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2 focus-visible:ring-offset-bg ' +
    'active:scale-[0.98] disabled:active:scale-100 disabled:cursor-not-allowed [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        primary:
          'h-button w-full rounded-pill bg-primary px-6 text-center text-on-primary type-button ' +
          'disabled:bg-track disabled:text-seg-off',
        round: 'size-button rounded-pill bg-primary text-on-primary disabled:bg-track disabled:text-seg-off [&_svg]:size-6',
        'round-secondary': 'size-touch rounded-pill bg-track text-ink disabled:text-seg-off [&_svg]:size-5',
        text: 'h-touch rounded-pill px-2 text-[14px] font-extrabold text-ink underline underline-offset-4 disabled:text-seg-off',
      },
      inSheet: {
        true: '',
        false: '',
      },
    },
    compoundVariants: [
      { variant: 'primary', inSheet: true, className: 'disabled:bg-sheet-track' },
      { variant: 'round-secondary', inSheet: true, className: 'bg-sheet-track' },
    ],
    defaultVariants: { variant: 'primary', inSheet: false },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, inSheet, type = 'button', ...props }, ref) => (
    <button ref={ref} type={type} className={cn(buttonVariants({ variant, inSheet }), className)} {...props} />
  )
);
Button.displayName = 'PastelButton';
