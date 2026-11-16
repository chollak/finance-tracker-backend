/**
 * The code of every lazy page (#291), one loader per page module. The router's `lazy()` and the load ahead after Home
 * share them, so both ask for the same piece. Each names its page's module, never a barrel of all the pages: one
 * import of a barrel would put every screen into a single piece, and Home would wait for all of them. The screens of
 * one page module (analytics, the accounts, voice and receipts offline) share its piece.
 */
export const pageLoaders = {
  home: () => import('@/pages/home'),
  transactions: () => import('@/pages/transactions'),
  analytics: () => import('@/pages/analytics'),
  more: () => import('@/pages/more'),
  categories: () => import('@/pages/categories'),
  manualEntry: () => import('@/pages/manual-entry'),
  captureReview: () => import('@/pages/capture-review'),
  captureOffline: () => import('@/pages/capture-offline'),
  accounts: () => import('@/pages/accounts'),
  audit: () => import('@/pages/audit'),
  pastelShowcase: () => import('@/pages/pastel-showcase'),
  login: () => import('@/pages/login'),
  firstLaunch: () => import('@/pages/first-launch'),
};

export type PageKey = keyof typeof pageLoaders;

/**
 * The screens Home leads to, loaded ahead once Home is drawn, the likeliest first: History and Analytics from Home's
 * tiles, «Ещё», manual entry from the composer's keypad, the review after a phrase, the accounts from the balance card,
 * the audit, the categories from «Ещё», voice and receipts offline. Not Home itself, not the login or the first launch
 * (the app is past them), not the showcase (no link leads there).
 */
export const SCREENS_AFTER_HOME: readonly PageKey[] = [
  'transactions',
  'analytics',
  'more',
  'manualEntry',
  'captureReview',
  'accounts',
  'audit',
  'categories',
  'captureOffline',
];
