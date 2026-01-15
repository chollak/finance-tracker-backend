import { getCategoryIcon, getCategoryColor } from '../lib';

interface CategoryIconProps {
  category: string;
  size?: 'sm' | 'md' | 'lg';
}

/**
 * Category icon with colored circular background
 */
export function CategoryIcon({ category, size = 'md' }: CategoryIconProps) {
  const icon = getCategoryIcon(category);
  const colorClasses = getCategoryColor(category);

  const sizeClasses = {
    sm: 'w-8 h-8 text-base',
    md: 'w-10 h-10 text-xl',
    lg: 'w-12 h-12 text-2xl',
  };

  return (
    <div
      className={`flex items-center justify-center rounded-full ${colorClasses} ${sizeClasses[size]}`}
    >
      {icon}
    </div>
  );
}
