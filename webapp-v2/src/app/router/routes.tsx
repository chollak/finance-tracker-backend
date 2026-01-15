import { createBrowserRouter, Outlet } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import { Loading } from '@/shared/ui/loading';
import { Layout } from '@/shared/ui/layout';

// Lazy load pages for code splitting
const HomePage = lazy(() => import('@/pages').then(m => ({ default: m.HomePage })));
const TransactionsPage = lazy(() => import('@/pages').then(m => ({ default: m.TransactionsPage })));
const AddTransactionPage = lazy(() => import('@/pages').then(m => ({ default: m.AddTransactionPage })));
const EditTransactionPage = lazy(() => import('@/pages').then(m => ({ default: m.EditTransactionPage })));
const BudgetsPage = lazy(() => import('@/pages').then(m => ({ default: m.BudgetsPage })));
const AddBudgetPage = lazy(() => import('@/pages').then(m => ({ default: m.AddBudgetPage })));
const EditBudgetPage = lazy(() => import('@/pages').then(m => ({ default: m.EditBudgetPage })));
const AnalyticsPage = lazy(() => import('@/pages').then(m => ({ default: m.AnalyticsPage })));

// Wrapper component with Suspense
function PageLoader({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<Loading fullScreen />}>{children}</Suspense>;
}

// Layout wrapper for main pages with navigation
function LayoutWrapper() {
  return (
    <Layout>
      <Outlet />
    </Layout>
  );
}

export const router = createBrowserRouter([
  {
    // Main pages with navigation layout
    element: <LayoutWrapper />,
    children: [
      {
        path: '/',
        element: <PageLoader><HomePage /></PageLoader>,
      },
      {
        path: '/transactions',
        element: <PageLoader><TransactionsPage /></PageLoader>,
      },
      {
        path: '/budgets',
        element: <PageLoader><BudgetsPage /></PageLoader>,
      },
      {
        path: '/analytics',
        element: <PageLoader><AnalyticsPage /></PageLoader>,
      },
    ],
  },
  // Form pages without navigation layout (have their own back button)
  {
    path: '/transactions/add',
    element: <PageLoader><AddTransactionPage /></PageLoader>,
  },
  {
    path: '/transactions/:id/edit',
    element: <PageLoader><EditTransactionPage /></PageLoader>,
  },
  {
    path: '/budgets/add',
    element: <PageLoader><AddBudgetPage /></PageLoader>,
  },
  {
    path: '/budgets/:id/edit',
    element: <PageLoader><EditBudgetPage /></PageLoader>,
  },
]);

// Route constants for type-safe navigation
export const ROUTES = {
  HOME: '/',
  TRANSACTIONS: '/transactions',
  ADD_TRANSACTION: '/transactions/add',
  EDIT_TRANSACTION: (id: string) => `/transactions/${id}/edit`,
  BUDGETS: '/budgets',
  ADD_BUDGET: '/budgets/add',
  EDIT_BUDGET: (id: string) => `/budgets/${id}/edit`,
  ANALYTICS: '/analytics',
} as const;
