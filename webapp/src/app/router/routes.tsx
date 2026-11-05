import { createBrowserRouter } from 'react-router-dom';
import { appRoutes } from './appRoutes';

export const router = createBrowserRouter(appRoutes);

// Route constants for type-safe navigation
export const ROUTES = {
  HOME: '/',
  TRANSACTIONS: '/transactions',
  MANUAL_ENTRY: '/add',
  CAPTURE_REVIEW: '/review',
  ANALYTICS: '/analytics',
  MORE: '/more',
} as const;
