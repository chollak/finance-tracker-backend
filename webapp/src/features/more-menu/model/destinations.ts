import { BarChart3, HandCoins, type LucideIcon } from 'lucide-react';
import { ROUTES } from '@/shared/lib/constants/routes';

export interface MoreDestination {
  href: string;
  title: string;
  description: string;
  icon: LucideIcon;
}

/**
 * Sections that are not part of the daily loop. Shared by the mobile sheet and
 * the /more page so the two can never drift apart.
 */
export const MORE_DESTINATIONS: MoreDestination[] = [
  {
    href: ROUTES.DEBTS,
    title: 'Долги',
    description: 'Кому должны вы и кто должен вам',
    icon: HandCoins,
  },
  {
    href: ROUTES.ANALYTICS,
    title: 'Аналитика',
    description: 'Категории, тренды и финансовые отчёты',
    icon: BarChart3,
  },
];

export function isMoreSectionActive(pathname: string): boolean {
  if (pathname === ROUTES.MORE) return true;
  return MORE_DESTINATIONS.some((destination) => destination.href === pathname);
}
