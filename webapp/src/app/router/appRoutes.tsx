import { Link, useRouteError, type RouteObject } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import { Button } from '@/shared/ui/button';
import { EmptyState } from '@/shared/ui/empty-state';
import { Loading } from '@/shared/ui/loading';
import { HomeSkeleton } from '@/widgets/home-skeleton';
import { AppShell } from './AppShell';
import { FirstLaunchGate } from './FirstLaunchGate';
import { AuthGate } from './AuthGate';

// Lazy load pages for code splitting
const HomePage = lazy(() => import('@/pages').then(m => ({ default: m.HomePage })));
const TransactionsPage = lazy(() => import('@/pages').then(m => ({ default: m.TransactionsPage })));
const BudgetsPage = lazy(() => import('@/pages').then(m => ({ default: m.BudgetsPage })));
const AddBudgetPage = lazy(() => import('@/pages').then(m => ({ default: m.AddBudgetPage })));
const EditBudgetPage = lazy(() => import('@/pages').then(m => ({ default: m.EditBudgetPage })));
const DebtsPage = lazy(() => import('@/pages').then(m => ({ default: m.DebtsPage })));
const AddDebtPage = lazy(() => import('@/pages').then(m => ({ default: m.AddDebtPage })));
const DebtDetailsPage = lazy(() => import('@/pages').then(m => ({ default: m.DebtDetailsPage })));
const AnalyticsPage = lazy(() => import('@/pages').then(m => ({ default: m.AnalyticsPage })));
// One category of the month: its days and operations (FT-121)
const CategoryAnalyticsPage = lazy(() => import('@/pages').then(m => ({ default: m.CategoryAnalyticsPage })));
const MorePage = lazy(() => import('@/pages').then(m => ({ default: m.MorePage })));
// The categories (FT-127), opened from «Ещё»
const CategoriesPage = lazy(() => import('@/pages').then(m => ({ default: m.CategoriesPage })));
// FT-088 spike page: not linked from the app, opened by URL inside Telegram on each device
const VoiceCheckPage = lazy(() => import('@/pages').then(m => ({ default: m.VoiceCheckPage })));
// Pastel component showcase in both themes (FT-093), not linked from the app
const PastelShowcasePage = lazy(() => import('@/pages').then(m => ({ default: m.PastelShowcasePage })));
// Manual entry with the app's own keypad (FT-113), opened from Home, «Ещё» and an empty History
const ManualEntryPage = lazy(() => import('@/pages').then(m => ({ default: m.ManualEntryPage })));
// The review of the records a phrase from Home's composer made (FT-114)
const CaptureReviewPage = lazy(() => import('@/pages').then(m => ({ default: m.CaptureReviewPage })));
// Voice and receipts without a connection (FT-129): opened by the composer's microphone and camera offline
const VoiceOfflinePage = lazy(() => import('@/pages').then(m => ({ default: m.VoiceOfflinePage })));
const ReceiptOfflinePage = lazy(() => import('@/pages').then(m => ({ default: m.ReceiptOfflinePage })));
// Accounts and the rate, opened from the balance card on Home, and one account's screen (FT-118)
const AccountsPage = lazy(() => import('@/pages').then(m => ({ default: m.AccountsPage })));
const AccountPage = lazy(() => import('@/pages').then(m => ({ default: m.AccountPage })));
// Transfer and exchange between accounts (FT-119), from the accounts or an account
const TransferPage = lazy(() => import('@/pages').then(m => ({ default: m.TransferPage })));

// Wrapper component with Suspense; Home's code loads behind Home's skeleton (FT-112)
function PageLoader({ children, fallback = <Loading fullScreen /> }: { children: React.ReactNode; fallback?: React.ReactNode }) {
  return <Suspense fallback={fallback}>{children}</Suspense>;
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

/**
 * Every route of the app. `routes.tsx` makes the browser router of it; tests match addresses against it
 * without a browser.
 */
export const appRoutes: RouteObject[] = [
  // Showcase and device checks: outside the first launch, not linked from the app
  {
    path: '/dev/pastel',
    element: <PageLoader><PastelShowcasePage /></PageLoader>,
  },
  {
    path: '/dev/voice-check',
    element: <PageLoader><VoiceCheckPage /></PageLoader>,
  },
  {
    // Every app screen needs a signed-in account (FT-128): in a browser without a session — the login screen
    element: <AuthGate />,
    children: [
      {
        // Every app screen opens only after the first launch (FT-109)
        element: <FirstLaunchGate />,
        children: [
          {
            // No bottom bar (FT-110): Home opens History and Analytics, «Ещё» the rest; every other
            // screen is nested and has «Назад» (Telegram's BackButton or its own)
            element: <AppShell />,
            errorElement: <RouterErrorPage />,
            children: [
              {
                path: '/',
                element: <PageLoader fallback={<HomeSkeleton />}><HomePage /></PageLoader>,
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
                path: '/analytics/categories/:id',
                element: <PageLoader><CategoryAnalyticsPage /></PageLoader>,
              },
              {
                path: '/more',
                element: <PageLoader><MorePage /></PageLoader>,
              },
              {
                path: '/more/categories',
                element: <PageLoader><CategoriesPage /></PageLoader>,
              },
              {
                path: '/accounts',
                element: <PageLoader><AccountsPage /></PageLoader>,
              },
              {
                // Before /accounts/:id in reading order; react-router ranks the static segment above it anyway
                path: '/accounts/transfer',
                element: <PageLoader><TransferPage /></PageLoader>,
              },
              {
                path: '/accounts/:id',
                element: <PageLoader><AccountPage /></PageLoader>,
              },
              {
                path: '/add',
                element: <PageLoader><ManualEntryPage /></PageLoader>,
              },
              {
                path: '/review',
                element: <PageLoader><CaptureReviewPage /></PageLoader>,
              },
              {
                path: '/offline-voice',
                element: <PageLoader><VoiceOfflinePage /></PageLoader>,
              },
              {
                path: '/offline-receipt',
                element: <PageLoader><ReceiptOfflinePage /></PageLoader>,
              },
              // Form and detail pages. A record has no page: its sheet opens over the list (FT-115), and a link
              // to a record is Home with `?record=` (ROUTES.RECORD)
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
              {
                path: '*',
                element: <NotFoundPage />,
              },
            ],
          },
        ],
      },
    ],
  },
];
