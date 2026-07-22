import { Link, useLocation } from 'react-router-dom';
import { Home, Receipt, Wallet, BarChart3, HandCoins, Plus } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { cn } from '@/shared/lib/utils';
import { ROUTES } from '@/shared/lib/constants/routes';
import { useUserStore } from '@/entities/user/model/store';
import { transactionKeys } from '@/entities/transaction/api/keys';
import { transactionToViewModel } from '@/entities/transaction/lib/toViewModel';
import { budgetKeys } from '@/entities/budget/api/keys';
import { budgetToViewModel } from '@/entities/budget/lib/toViewModel';
import { debtKeys } from '@/entities/debt/api/keys';
import { debtToViewModel } from '@/entities/debt/lib/toViewModel';
import { dashboardKeys } from '@/entities/dashboard/api/keys';
import { apiClient } from '@/shared/api';
import { API_ENDPOINTS } from '@/shared/lib/constants';
import type { Transaction, BudgetSummary, Debt } from '@/shared/types';
import { haptic } from '@/shared/lib/haptic';
import { QuickAddSheet } from '@/features/quick-add';

// Split around the center Add action: 2 items left, 3 items right
const leftNavItems = [
  {
    href: ROUTES.HOME,
    label: 'Главная',
    icon: Home,
  },
  {
    href: ROUTES.TRANSACTIONS,
    label: 'История',
    icon: Receipt,
  },
];

const rightNavItems = [
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

const navItems = [...leftNavItems, ...rightNavItems];

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
            const response = await apiClient.get<Transaction[]>(API_ENDPOINTS.TRANSACTIONS.LIST(userId));
            // IMPORTANT: Transform to ViewModel to match useTransactions queryFn
            return (response.data || []).map(transactionToViewModel);
          },
          staleTime,
        });
        break;

      case ROUTES.BUDGETS:
        queryClient.prefetchQuery({
          queryKey: budgetKeys.summaries(userId),
          queryFn: async () => {
            const response = await apiClient.get<BudgetSummary[]>(API_ENDPOINTS.BUDGETS.SUMMARIES(userId));
            // IMPORTANT: Transform to ViewModel to match useBudgetSummaries queryFn
            return (response.data || []).map(budgetToViewModel);
          },
          staleTime,
        });
        break;

      case ROUTES.DEBTS:
        queryClient.prefetchQuery({
          queryKey: debtKeys.list(userId, { status: 'active' }),
          queryFn: async () => {
            const response = await apiClient.get<Debt[]>(API_ENDPOINTS.DEBTS.LIST(userId, 'active'));
            // IMPORTANT: Transform to ViewModel to match useDebts queryFn
            return (response.data || []).map(debtToViewModel);
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

  const renderNavItem = (item: (typeof navItems)[number]) => {
    const isActive = location.pathname === item.href;
    const Icon = item.icon;

    return (
      <Link
        key={item.href}
        to={item.href}
        onClick={() => {
          // Only trigger haptic if navigating to different page
          if (!isActive) {
            haptic.tabChanged();
          }
        }}
        onMouseEnter={() => prefetchForRoute(item.href)}
        onFocus={() => prefetchForRoute(item.href)}
        onTouchStart={() => prefetchForRoute(item.href)}
        className={cn(
          'flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 px-1 py-1.5 text-[11px] leading-none transition-colors',
          isActive
            ? 'font-medium text-success'
            : 'text-muted-foreground hover:text-foreground'
        )}
      >
        <Icon className={cn('h-5 w-5', isActive ? 'text-success' : '')} />
        <span className="max-w-full truncate">{item.label}</span>
      </Link>
    );
  };

  return (
    <nav className="fixed inset-x-0 bottom-0 z-50 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_20px_rgba(0,0,0,0.06)] backdrop-blur md:hidden">
      <div className="flex h-[4.5rem] items-center justify-around px-1">
        {leftNavItems.map((item) => renderNavItem(item))}

        {/* Central elevated Add Transaction action — the core mobile CTA */}
        <div className="flex flex-[0.85] items-center justify-center">
          <QuickAddSheet>
            <button
              type="button"
              onClick={() => haptic.press()}
              aria-label="Добавить транзакцию"
              className="-translate-y-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-success text-success-foreground shadow-md shadow-success/25 ring-4 ring-background transition-transform active:scale-95"
            >
              <Plus className="h-5 w-5" aria-hidden="true" />
            </button>
          </QuickAddSheet>
        </div>

        {rightNavItems.map((item) => renderNavItem(item))}
      </div>
    </nav>
  );
}
