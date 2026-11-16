import type { RouteObject } from 'react-router-dom';
import { lazy } from 'react';
import { HomeSkeleton } from '@/widgets/home-skeleton';
// Not lazy, as the router's error page (`RouterErrorPage`): an unknown address is the `*` route at the end (#222)
import { NotFoundPage } from '@/pages/not-found';
import { AppShell } from './AppShell';
import { FirstLaunchGate } from './FirstLaunchGate';
import { AuthGate } from './AuthGate';
import { PageLoader } from './PageLoader';
import { pageLoaders } from './pageLoaders';
import { RouterErrorPage } from './RouterErrorPage';
import { PrefetchScreensAfterHome } from './screenPrefetch';

// Each screen loads its own code (#291), through its page's loader (`pageLoaders`); once Home is drawn, the screens it
// leads to load ahead (`PrefetchScreensAfterHome`)
const HomePage = lazy(() => pageLoaders.home().then((m) => ({ default: m.HomePage })));
const TransactionsPage = lazy(() => pageLoaders.transactions().then((m) => ({ default: m.TransactionsPage })));
const AnalyticsPage = lazy(() => pageLoaders.analytics().then((m) => ({ default: m.AnalyticsPage })));
// One category of the month: its days and operations (FT-121)
const CategoryAnalyticsPage = lazy(() => pageLoaders.analytics().then((m) => ({ default: m.CategoryAnalyticsPage })));
const MorePage = lazy(() => pageLoaders.more().then((m) => ({ default: m.MorePage })));
// The categories (FT-127), opened from «Ещё»
const CategoriesPage = lazy(() => pageLoaders.categories().then((m) => ({ default: m.CategoriesPage })));
// Pastel component showcase in both themes (FT-093), not linked from the app
const PastelShowcasePage = lazy(() => pageLoaders.pastelShowcase().then((m) => ({ default: m.PastelShowcasePage })));
// Manual entry with the app's own keypad (FT-113), opened by the keypad button of Home's composer, by an empty month of
// analytics (FT-121) and by «Ввести вручную» on the voice and receipt screens without a connection (FT-129)
const ManualEntryPage = lazy(() => pageLoaders.manualEntry().then((m) => ({ default: m.ManualEntryPage })));
// The review of the records a phrase from Home's composer made (FT-114)
const CaptureReviewPage = lazy(() => pageLoaders.captureReview().then((m) => ({ default: m.CaptureReviewPage })));
// Voice and receipts without a connection (FT-129): opened by the composer's microphone and camera offline
const VoiceOfflinePage = lazy(() => pageLoaders.captureOffline().then((m) => ({ default: m.VoiceOfflinePage })));
const ReceiptOfflinePage = lazy(() => pageLoaders.captureOffline().then((m) => ({ default: m.ReceiptOfflinePage })));
// Accounts and the rate, opened from the balance card on Home, and one account's screen (FT-118)
const AccountsPage = lazy(() => pageLoaders.accounts().then((m) => ({ default: m.AccountsPage })));
const AccountPage = lazy(() => pageLoaders.accounts().then((m) => ({ default: m.AccountPage })));
// Transfer and exchange between accounts (FT-119), from the accounts or an account
const TransferPage = lazy(() => pageLoaders.accounts().then((m) => ({ default: m.TransferPage })));
// The spending audit of the month before (FT-132), from Home, «Ещё» and analytics
const AuditPage = lazy(() => pageLoaders.audit().then((m) => ({ default: m.AuditPage })));

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
                // Beside Home, inside its Suspense: the load ahead starts only once Home itself is drawn
                element: (
                  <PageLoader fallback={<HomeSkeleton />}>
                    <HomePage />
                    <PrefetchScreensAfterHome />
                  </PageLoader>
                ),
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
