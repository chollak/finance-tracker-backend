import { useLocation, useNavigate } from 'react-router-dom';
import { History, Home, MoreHorizontal } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { ROUTES } from '@/shared/lib/constants/routes';
import { requestCaptureFocus } from '@/shared/lib/captureFocus';
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
import { Dock, DockItem } from './dock';
import { CaptureDockAction } from './capture-dock';

const routeNavItems = [
  {
    href: ROUTES.HOME,
    label: 'Главная',
    icon: Home,
  },
  {
    href: ROUTES.TRANSACTIONS,
    label: 'История',
    // `History`, not `Receipt`: the receipt glyph already means the «Чек» capture channel in the
    // Home capture card, and one symbol cannot stand for two different things in the same app.
    icon: History,
  },
  {
    href: ROUTES.MORE,
    label: 'Ещё',
    icon: MoreHorizontal,
  },
];

/** Dock item size in px — also the minimum touch target the dock has to keep. */
const DOCK_ITEM_SIZE = 46;

/**
 * Bottom navigation for mobile devices
 * Hidden on desktop (md:hidden)
 * Optimized: Prefetches data on hover/focus for instant navigation
 *
 * The dock is capture-first: the centre is `Записать`, which hands focus to the quick-capture
 * field, not the manual transaction form.
 *
 * Navigation and action are kept apart (FT-086). The dock used to carry a bare `+` for the manual
 * form directly beside `Записать` — two "create" controls touching, with the slowest flow wearing
 * the most universal add glyph, and no label on either to tell them apart. The manual form moved
 * to «Ещё», where it reads as the fallback channel it is; the dock is now three labelled routes
 * around one named action. Routes are untouched: Главная, История and Ещё all still reach their
 * pages, and each is a real link so Ctrl/⌘-click behaves.
 */
export function BottomNav() {
  const location = useLocation();
  const navigate = useNavigate();
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
        href={item.href}
        label={item.label}
        active={active}
        onPrefetch={() => prefetchForRoute(item.href)}
        // The `<Link>` does the navigating; this only adds the tab-change haptic, and only when
        // the press actually changes page.
        onClick={() => {
          if (!isCurrentRoute) haptic.tabChanged();
        }}
      >
        <Icon className="h-5 w-5" aria-hidden="true" />
      </DockItem>
    );
  };

  /**
   * Centre press = "I want to write something down".
   *
   * On Home the capture field is already mounted, so the request lands straight away. Anywhere
   * else the dock navigates Home first; `requestCaptureFocus()` is latched, so the card picks the
   * request up when it mounts rather than the press being swallowed by the route change.
   */
  const handleCapturePress = () => {
    haptic.press();

    if (location.pathname !== ROUTES.HOME) {
      navigate(ROUTES.HOME);
    }

    requestCaptureFocus();
  };

  // Four equal slots, in the order the day runs: where you look, where you correct, the one
  // thing that writes, and everything that is not daily. No scrim — a flush opaque bar has
  // nothing to fade.
  return (
    <nav
      aria-label="Основная навигация"
      className="fixed inset-x-0 bottom-0 z-50 md:hidden"
    >
      <Dock size={DOCK_ITEM_SIZE}>
        {renderDockItem(routeNavItems[0])}
        {renderDockItem(routeNavItems[1])}
        <CaptureDockAction size={DOCK_ITEM_SIZE} onClick={handleCapturePress} />
        {renderDockItem(routeNavItems[2])}
      </Dock>
    </nav>
  );
}
