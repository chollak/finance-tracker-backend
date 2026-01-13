import { ReactNode } from 'react';

export type BadgeVariant = 'default' | 'success' | 'error' | 'warning' | 'info';

export interface BadgeProps {
  variant?: BadgeVariant;
  children: ReactNode;
  className?: string;
}

const variantStyles = {
  default: 'bg-gray-100 text-gray-600',
  success: 'bg-green-100 text-green-700',
  error: 'bg-red-100 text-red-700',
  warning: 'bg-yellow-100 text-yellow-700',
  info: 'bg-blue-100 text-blue-700',
};

export const Badge = ({
  variant = 'default',
  children,
  className = '',
}: BadgeProps) => {
  return (
    <span
      className={`
        ${variantStyles[variant]}
        px-2 py-1
        rounded-lg
        text-xs font-medium
        inline-flex items-center
        ${className}
      `}
    >
      {children}
    </span>
  );
};
