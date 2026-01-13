import { ButtonProps } from './Button.types';

const variantStyles = {
  primary: 'bg-card-dark text-white hover:bg-gray-800',
  secondary: 'bg-gray-100 text-card-dark hover:bg-gray-200',
  outline: 'border-2 border-gray-200 text-card-dark hover:border-gray-300 hover:bg-gray-50',
  ghost: 'text-gray-600 hover:bg-gray-100',
  lime: 'bg-lime text-black hover:opacity-90',
  lavender: 'bg-lavender text-black hover:opacity-90',
};

const sizeStyles = {
  sm: 'px-4 py-2 text-sm rounded-2xl',
  md: 'px-6 py-3 text-base rounded-3xl',
  lg: 'px-8 py-4 text-lg rounded-4xl',
};

export const Button = ({
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  leftIcon,
  rightIcon,
  isLoading = false,
  children,
  className = '',
  disabled,
  ...props
}: ButtonProps) => {
  const baseStyles = 'font-semibold transition-all duration-200 flex items-center justify-center gap-3 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed';

  return (
    <button
      className={`
        ${baseStyles}
        ${variantStyles[variant]}
        ${sizeStyles[size]}
        ${fullWidth ? 'w-full' : ''}
        ${className}
      `}
      disabled={disabled || isLoading}
      {...props}
    >
      {isLoading && <span className="animate-spin">⏳</span>}
      {!isLoading && leftIcon && <span>{leftIcon}</span>}
      {children}
      {!isLoading && rightIcon && <span>{rightIcon}</span>}
    </button>
  );
};
