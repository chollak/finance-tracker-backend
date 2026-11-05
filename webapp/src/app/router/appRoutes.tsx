import { isRouteErrorResponse, useRouteError, type RouteObject } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import { Loading } from '@/shared/ui/loading';
import { HomeSkeleton } from '@/widgets/home-skeleton';
// Not lazy, so the router's error page below never needs a piece of code to load: a page whose code did not load is
// one of its causes (#240). That failure is not a 404 — an unknown address is the `*` route at the end (#222)
import { NotFoundPage } from '@/pages/not-found';
import { RouteErrorPage } from '@/pages/route-error';
import { AppShell } from './AppShell';
import { FirstLaunchGate } from './FirstLaunchGate';
import { AuthGate } from './AuthGate';

// Lazy load pages for code splitting
const HomePage = lazy(() => import('@/pages').then(m => ({ default: m.HomePage })));
const TransactionsPage = lazy(() => import('@/pages').then(m => ({ default: m.TransactionsPage })));
const AnalyticsPage = lazy(() => import('@/pages').then(m => ({ default: m.AnalyticsPage })));
// One category of the month: its days and operations (FT-121)
const CategoryAnalyticsPage = lazy(() => import('@/pages').then(m => ({ default: m.CategoryAnalyticsPage })));
const MorePage = lazy(() => import('@/pages').then(m => ({ default: m.MorePage })));
// The categories (FT-127), opened from «Ещё»
const CategoriesPage = lazy(() => import('@/pages').then(m => ({ default: m.CategoriesPage })));
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
// The spending audit of the month before (FT-132), from Home, «Ещё» and analytics
const AuditPage = lazy(() => import('@/pages').then(m => ({ default: m.AuditPage })));

// Wrapper component with Suspense; Home's code loads behind Home's skeleton (FT-112)
function PageLoader({ children, fallback = <Loading fullScreen /> }: { children: React.ReactNode; fallback?: React.ReactNode }) {
  return <Suspense fallback={fallback}>{children}</Suspense>;
}

/**
 * What the router shows when a route fails. A 404 is «Такой страницы нет»; anything else — a page whose code did not
 * load or that fell while drawing — is «Экран не открылся» (#240). React Router has already logged the failure.
 */
function RouterErrorPage() {
  const error = useRouteError();

  if (isRouteErrorResponse(error) && error.status === 404) {
    return <NotFoundPage />;
  }

  return <RouteErrorPage />;
}

/**
 * Every route of the app. `routes.tsx` makes the browser router of it; tests match addresses against it
 * without a browser.
 */
export const appRoutes: RouteObject[] = [
  // The showcase: outside the login and the first launch, not linked from the app
  {
    path: '/dev/pastel',
    element: <PageLoader><PastelShowcasePage /></PageLoader>,
  },
  {
    // Every app screen needs a signed-in account (FT-128): in a browser without a session — the login screen
    element: <AuthGate />,
    // The login and the first launch load their own code too; without this their failure would be the router's
    // technical page (#240). A screen inside the shell fails in the shell's place
    errorElement: <RouterErrorPage />,
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
                path: '/audit',
                element: <PageLoader><AuditPage /></PageLoader>,
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
              // A record has no page: its sheet opens over the list (FT-115), and a link to a record is Home with
              // `?record=` (ROUTES.RECORD). The debt screens are gone (#265): an old link to them lands here
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
