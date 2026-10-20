import { createBrowserRouter } from 'react-router-dom';
import { appRoutes } from './appRoutes';

export const router = createBrowserRouter(appRoutes);

// Route constants for type-safe navigation
export const ROUTES = {
  HOME: '/',
  TRANSACTIONS: '/transactions',
  MANUAL_ENTRY: '/add',
  CAPTURE_REVIEW: '/review',
  BUDGETS: '/budgets',
  ADD_BUDGET: '/budgets/add',
  EDIT_BUDGET: (id: string) => `/budgets/${id}/edit`,
  DEBTS: '/debts',
  ADD_DEBT: '/debts/add',
  DEBT_DETAILS: (id: string) => `/debts/${id}`,
  ANALYTICS: '/analytics',
  MORE: '/more',
} as const;
