import { Badge } from '@/shared/ui/badge';
import { getCategoryIcon, getCategoryColor } from '../lib';

interface CategoryBadgeProps {
  category: string;
  showIcon?: boolean;
}

/**
 * Category badge with icon and colored background
 */
export function CategoryBadge({ category, showIcon = true }: CategoryBadgeProps) {
  const icon = getCategoryIcon(category);
  const colorClasses = getCategoryColor(category);

  return (
    <Badge className={colorClasses} variant="secondary">
      {showIcon && <span className="mr-1">{icon}</span>}
      {category}
    </Badge>
  );
}
