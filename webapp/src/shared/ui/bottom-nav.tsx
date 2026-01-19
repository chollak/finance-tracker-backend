import { Link, useLocation } from 'react-router-dom';
import { Home, Receipt, Wallet, BarChart3, HandCoins } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { cn } from '@/shared/lib/utils';
import { ROUTES } from '@/shared/lib/constants/routes';
import { useUserStore } from '@/entities/user/model/store';
import { transactionKeys } from '@/entities/transaction/api/keys';
import { budgetKeys } from '@/entities/budget/api/keys';
import { debtKeys } from '@/entities/debt/api/keys';
import { dashboardKeys } from '@/entities/dashboard/api/keys';
import { apiClient } from '@/shared/api';
import { API_ENDPOINTS } from '@/shared/lib/constants';

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
    href: ROUTES.DEBTS,
    label: 'Долги',
    icon: HandCoins,
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
 * Optimized: Prefetches data on hover/focus for instant navigation
 */
export function BottomNav() {
  const location = useLocation();
  const queryClient = useQueryClient();
  const userId = useUserStore((state) => state.userId);

  // Prefetch functions for each page
  const prefetchForRoute = (href: string) => {
    if (!userId) return;

    // Don't prefetch if data is fresh (stale time not exceeded)
    const staleTime = 30000; // 30 seconds

    switch (href) {
      case ROUTES.HOME:
        queryClient.prefetchQuery({
          queryKey: dashboardKeys.insights(userId),
          queryFn: async () => {
            const response = await apiClient.get(`/dashboard/${userId}`);
            return response.data;
          },
          staleTime,
        });
        break;

      case ROUTES.TRANSACTIONS:
        queryClient.prefetchQuery({
          queryKey: transactionKeys.list(userId),
          queryFn: async () => {
            const response = await apiClient.get(API_ENDPOINTS.TRANSACTIONS.LIST(userId));
            return response.data;
          },
          staleTime,
        });
        break;

      case ROUTES.BUDGETS:
        queryClient.prefetchQuery({
          queryKey: budgetKeys.summaries(userId),
          queryFn: async () => {
            const response = await apiClient.get(API_ENDPOINTS.BUDGETS.SUMMARIES(userId));
            return response.data;
          },
          staleTime,
        });
        break;

      case ROUTES.DEBTS:
        queryClient.prefetchQuery({
          queryKey: debtKeys.list(userId, { status: 'active' }),
          queryFn: async () => {
            const response = await apiClient.get(API_ENDPOINTS.DEBTS.LIST(userId, 'active'));
            return response.data;
          },
          staleTime,
        });
        break;

      case ROUTES.ANALYTICS:
        // Analytics uses transaction data
        queryClient.prefetchQuery({
          queryKey: transactionKeys.analytics(userId),
          queryFn: async () => {
            const response = await apiClient.get(
              API_ENDPOINTS.TRANSACTIONS.ANALYTICS.SUMMARY(userId)
            );
            return response.data;
          },
          staleTime,
        });
        break;
    }
  };

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
              onMouseEnter={() => prefetchForRoute(item.href)}
              onFocus={() => prefetchForRoute(item.href)}
              onTouchStart={() => prefetchForRoute(item.href)}
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
