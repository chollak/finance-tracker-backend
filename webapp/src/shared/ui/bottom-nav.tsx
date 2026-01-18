import { Link, useLocation } from 'react-router-dom';
import { Home, Receipt, Wallet, BarChart3 } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { ROUTES } from '@/shared/lib/constants/routes';

const navItems = [
  {
    href: ROUTES.HOME,
    label: 'Главная',
    icon: Home,
  },
  {
    href: ROUTES.TRANSACTIONS,
    label: 'Транзакции',
    icon: Receipt,
  },
  {
    href: ROUTES.BUDGETS,
    label: 'Бюджеты',
    icon: Wallet,
  },
  {
    href: ROUTES.ANALYTICS,
    label: 'Аналитика',
    icon: BarChart3,
  },
];

/**
 * Bottom navigation for mobile devices
 * Hidden on desktop (md:hidden)
 */
export function BottomNav() {
  const location = useLocation();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t bg-background dark:bg-card dark:border-border md:hidden">
      <div className="flex h-16 items-center justify-around">
        {navItems.map((item) => {
          const isActive = location.pathname === item.href;
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              to={item.href}
              className={cn(
                'flex flex-1 flex-col items-center justify-center gap-1 py-2 text-xs transition-colors',
                isActive
                  ? 'text-foreground dark:text-white'
                  : 'text-muted-foreground dark:text-gray-400 hover:text-foreground dark:hover:text-white'
              )}
            >
              <Icon className={cn('h-5 w-5', isActive ? 'text-foreground dark:text-white' : '')} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
