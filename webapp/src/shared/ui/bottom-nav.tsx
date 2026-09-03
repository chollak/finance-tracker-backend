import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Home, Receipt, MoreHorizontal, Plus } from 'lucide-react';
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
import { Dock, DockItem, DockSeparator, DockSplit } from './dock';

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
    href: ROUTES.MORE,
    label: 'Ещё',
    icon: MoreHorizontal,
  },
];

// Side zones of the dock. They are laid out as equal-width columns, so an
// uneven split (2 / 1 since Budgets moved under "Ещё") still keeps the centre
// action on the viewport axis.
const LEFT_NAV_ITEMS = routeNavItems.slice(0, 2);
const RIGHT_NAV_ITEMS = routeNavItems.slice(2);

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
    // Budgets moved out of the primary dock; it stays reachable under "Ещё",
    // so the "Ещё" tab owns its active state.
    const moreRoutes: string[] = [ROUTES.MORE, ROUTES.BUDGETS, ROUTES.DEBTS, ROUTES.ANALYTICS];
    return href === ROUTES.MORE
      ? moreRoutes.includes(location.pathname)
      : location.pathname === href;
  };

  const renderDockItem = (item: (typeof routeNavItems)[number]) => {
    const Icon = item.icon;
    const active = isRouteActive(item.href);
    const isCurrentRoute = location.pathname === item.href;

    return (
      <DockItem
        key={item.href}
        active={active}
        aria-label={item.label}
        onPrefetch={() => prefetchForRoute(item.href)}
        onClick={() => {
          if (!isCurrentRoute) {
            haptic.tabChanged();
            navigate(item.href);
          }
        }}
      >
        <Icon className="h-5 w-5" aria-hidden="true" />
      </DockItem>
    );
  };

  return (
    <>
      <nav
        aria-label="Основная навигация"
        className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex justify-center px-3 pb-[calc(env(safe-area-inset-bottom)+0.7rem)] pt-8 md:hidden"
      >
        <div className="absolute inset-x-0 bottom-0 -z-10 h-28 bg-gradient-to-t from-background via-background/95 to-transparent" aria-hidden="true" />
        <Dock size={46} className="pointer-events-auto w-full max-w-xs rounded-[1.65rem]">
          <DockSplit
            left={LEFT_NAV_ITEMS.map((item) => renderDockItem(item))}
            center={
              <>
                <DockSeparator />
                <DockItem
                  variant="primary"
                  aria-label="Добавить транзакцию"
                  onClick={() => {
                    haptic.press();
                    setQuickAddOpen(true);
                  }}
                >
                  <Plus className="h-5 w-5" aria-hidden="true" />
                </DockItem>
                <DockSeparator />
              </>
            }
            right={RIGHT_NAV_ITEMS.map((item) => renderDockItem(item))}
          />
        </Dock>
      </nav>
      <ControlledQuickAddSheet open={quickAddOpen} onOpenChange={setQuickAddOpen} />
    </>
  );
}
