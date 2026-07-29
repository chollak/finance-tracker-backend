import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Home, Receipt, Wallet, MoreHorizontal, Plus } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
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
import { ControlledQuickAddSheet } from '@/features/quick-add';
import { ModernMobileMenu, type ModernMobileMenuItem } from './modern-mobile-menu';

const routeNavItems = [
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
  {
    href: ROUTES.BUDGETS,
    label: 'Бюджеты',
    icon: Wallet,
  },
  {
    href: ROUTES.MORE,
    label: 'Ещё',
    icon: MoreHorizontal,
  },
];

/**
 * Bottom navigation for mobile devices
 * Hidden on desktop (md:hidden)
 * Optimized: Prefetches data on hover/focus for instant navigation
 */
export function BottomNav() {
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const userId = useUserStore((state) => state.userId);
  const [quickAddOpen, setQuickAddOpen] = useState(false);

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

  const isRouteActive = (href: string) => {
    const moreRoutes: string[] = [ROUTES.MORE, ROUTES.DEBTS, ROUTES.ANALYTICS];
    return href === ROUTES.MORE
      ? moreRoutes.includes(location.pathname)
      : location.pathname === href;
  };

  const menuItems: ModernMobileMenuItem[] = [
    ...routeNavItems.slice(0, 2).map((item) => ({
      label: item.label,
      icon: item.icon,
      active: isRouteActive(item.href),
      onPrefetch: () => prefetchForRoute(item.href),
      onSelect: () => {
        if (!isRouteActive(item.href)) {
          haptic.tabChanged();
          navigate(item.href);
        }
      },
    })),
    {
      label: 'Добавить',
      icon: Plus,
      variant: 'primary',
      ariaLabel: 'Добавить транзакцию',
      onSelect: () => {
        haptic.press();
        setQuickAddOpen(true);
      },
    },
    ...routeNavItems.slice(2).map((item) => ({
      label: item.label,
      icon: item.icon,
      active: isRouteActive(item.href),
      onPrefetch: () => prefetchForRoute(item.href),
      onSelect: () => {
        if (!isRouteActive(item.href)) {
          haptic.tabChanged();
          navigate(item.href);
        }
      },
    })),
  ];

  return (
    <>
      <ModernMobileMenu items={menuItems} />
      <ControlledQuickAddSheet open={quickAddOpen} onOpenChange={setQuickAddOpen} />
    </>
  );
}
