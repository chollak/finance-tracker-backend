import { ReactNode } from 'react';

export type CardVariant = 'white' | 'dark' | 'gradient';

export interface CardProps {
  variant?: CardVariant;
  rounded?: 'lg' | 'xl' | '2xl' | '3xl' | '4xl';
  padding?: 'sm' | 'md' | 'lg';
  shadow?: boolean;
  hover?: boolean;
  className?: string;
  children: ReactNode;
}

const variantStyles = {
  white: 'bg-white',
  dark: 'bg-card-dark text-white',
  gradient: 'bg-gradient-to-br from-lime to-lavender',
};

const paddingStyles = {
  sm: 'p-4',
  md: 'p-6',
  lg: 'p-8',
};

export const Card = ({
  variant = 'white',
  rounded = '4xl',
  padding = 'md',
  shadow = true,
  hover = false,
  className = '',
  children,
}: CardProps) => {
  return (
    <div
      className={`
        ${variantStyles[variant]}
        rounded-${rounded}
        ${paddingStyles[padding]}
        ${shadow ? 'shadow-card' : ''}
        ${hover ? 'hover:shadow-card-hover transition-shadow duration-200' : ''}
        ${className}
      `}
    >
      {children}
    </div>
  );
};
