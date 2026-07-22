import { createBrowserRouter, Link, Outlet, ScrollRestoration, useRouteError } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import { Button } from '@/shared/ui/button';
import { EmptyState } from '@/shared/ui/empty-state';
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
const DebtsPage = lazy(() => import('@/pages').then(m => ({ default: m.DebtsPage })));
const AddDebtPage = lazy(() => import('@/pages').then(m => ({ default: m.AddDebtPage })));
const DebtDetailsPage = lazy(() => import('@/pages').then(m => ({ default: m.DebtDetailsPage })));
const AnalyticsPage = lazy(() => import('@/pages').then(m => ({ default: m.AnalyticsPage })));
const MorePage = lazy(() => import('@/pages').then(m => ({ default: m.MorePage })));

// Wrapper component with Suspense
function PageLoader({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<Loading fullScreen />}>{children}</Suspense>;
}

// Layout wrapper for main pages with navigation
function LayoutWrapper() {
  return (
    <Layout>
      <ScrollRestoration />
      <Outlet />
    </Layout>
  );
}

function NotFoundPage() {
  return (
    <div className="container mx-auto px-4 py-10">
      <div className="rounded-2xl border border-dashed bg-card">
        <EmptyState
          icon="🧭"
          title="Страница не найдена"
          description="Похоже, ссылка устарела или адрес введён с ошибкой. Вернитесь на главную и продолжите работу с финансами."
          action={
            <Button asChild>
              <Link to="/">На главную</Link>
            </Button>
          }
          size="lg"
        />
      </div>
    </div>
  );
}

function RouterErrorPage() {
  const error = useRouteError();

  if (error && typeof error === 'object' && 'status' in error && error.status === 404) {
    return <NotFoundPage />;
  }

  return (
    <div className="container mx-auto px-4 py-10">
      <div className="rounded-2xl border border-dashed bg-card">
        <EmptyState
          icon="⚠️"
          title="Что-то пошло не так"
          description="Не удалось открыть страницу. Попробуйте вернуться на главную или обновить приложение."
          action={
            <Button asChild>
              <Link to="/">На главную</Link>
            </Button>
          }
          size="lg"
        />
      </div>
    </div>
  );
}

export const router = createBrowserRouter([
  {
    // Main pages with navigation layout
    element: <LayoutWrapper />,
    errorElement: <Layout><RouterErrorPage /></Layout>,
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
        path: '/debts',
        element: <PageLoader><DebtsPage /></PageLoader>,
      },
      {
        path: '/analytics',
        element: <PageLoader><AnalyticsPage /></PageLoader>,
      },
      {
        path: '/more',
        element: <PageLoader><MorePage /></PageLoader>,
      },
      {
        path: '*',
        element: <NotFoundPage />,
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
  {
    path: '/debts/add',
    element: <PageLoader><AddDebtPage /></PageLoader>,
  },
  {
    path: '/debts/:id',
    element: <PageLoader><DebtDetailsPage /></PageLoader>,
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
  DEBTS: '/debts',
  ADD_DEBT: '/debts/add',
  DEBT_DETAILS: (id: string) => `/debts/${id}`,
  ANALYTICS: '/analytics',
  MORE: '/more',
} as const;
