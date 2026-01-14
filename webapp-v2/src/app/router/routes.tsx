import { createBrowserRouter } from 'react-router-dom';

// Placeholder pages - will be created in Phase 6
const HomePage = () => <div>Home Page</div>;
const TransactionsPage = () => <div>Transactions Page</div>;
const AddTransactionPage = () => <div>Add Transaction Page</div>;
const EditTransactionPage = () => <div>Edit Transaction Page</div>;
const BudgetsPage = () => <div>Budgets Page</div>;
const AddBudgetPage = () => <div>Add Budget Page</div>;
const EditBudgetPage = () => <div>Edit Budget Page</div>;
const AnalyticsPage = () => <div>Analytics Page</div>;

export const router = createBrowserRouter([
  {
    path: '/',
    element: <HomePage />,
  },
  {
    path: '/transactions',
    element: <TransactionsPage />,
  },
  {
    path: '/transactions/add',
    element: <AddTransactionPage />,
  },
  {
    path: '/transactions/:id/edit',
    element: <EditTransactionPage />,
  },
  {
    path: '/budgets',
    element: <BudgetsPage />,
  },
  {
    path: '/budgets/add',
    element: <AddBudgetPage />,
  },
  {
    path: '/budgets/:id/edit',
    element: <EditBudgetPage />,
  },
  {
    path: '/analytics',
    element: <AnalyticsPage />,
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
