import { Link, useLocation } from 'react-router-dom';
import { cn } from '@/shared/lib/utils';
import { ROUTES } from '@/shared/lib/constants/routes';

const navItems = [
  { href: ROUTES.HOME, label: 'Главная' },
  { href: ROUTES.TRANSACTIONS, label: 'Транзакции' },
  { href: ROUTES.BUDGETS, label: 'Бюджеты' },
  { href: ROUTES.ANALYTICS, label: 'Аналитика' },
];

/**
 * Top navigation for desktop
 * Hidden on mobile (hidden md:flex)
 */
export function TopNav() {
  const location = useLocation();

  return (
    <header className="sticky top-0 z-50 hidden border-b bg-background md:block">
      <div className="container mx-auto flex h-14 items-center px-4">
        {/* Logo */}
        <Link to={ROUTES.HOME} className="mr-8 font-semibold">
          Finance Tracker
        </Link>

        {/* Navigation Links */}
        <nav className="flex items-center gap-6">
          {navItems.map((item) => {
            const isActive = location.pathname === item.href;

            return (
              <Link
                key={item.href}
                to={item.href}
                className={cn(
                  'text-sm font-medium transition-colors hover:text-foreground',
                  isActive ? 'text-foreground' : 'text-muted-foreground'
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
