import { Link, useLocation } from 'react-router-dom';

interface NavigationProps {
  userId?: string;
}

export default function Navigation({ userId }: NavigationProps) {
  const location = useLocation();
  const query = userId ? `?userId=${userId}` : '';

  const isActive = (path: string) => location.pathname === path;

  return (
    <nav className="mb-6 border-b pb-4 hidden md:block">
      <div className="flex flex-wrap gap-4">
        <Link
          to={`/${query}`}
          className={`px-4 py-2 rounded-2xl text-sm font-medium transition-all ${
            isActive('/')
              ? 'bg-card-dark text-white'
              : 'text-gray-600 hover:text-card-dark hover:bg-gray-100'
          }`}
        >
          🏠 Home
        </Link>
        <Link
          to={`/dashboard${query}`}
          className={`px-4 py-2 rounded-2xl text-sm font-medium transition-all ${
            isActive('/dashboard')
              ? 'bg-card-dark text-white'
              : 'text-gray-600 hover:text-card-dark hover:bg-gray-100'
          }`}
        >
          📊 Dashboard
        </Link>
        <Link
          to={`/transactions${query}`}
          className={`px-4 py-2 rounded-2xl text-sm font-medium transition-all ${
            isActive('/transactions')
              ? 'bg-card-dark text-white'
              : 'text-gray-600 hover:text-card-dark hover:bg-gray-100'
          }`}
        >
          💳 Transactions
        </Link>
        <Link
          to={`/budgets${query}`}
          className={`px-4 py-2 rounded-2xl text-sm font-medium transition-all ${
            isActive('/budgets')
              ? 'bg-card-dark text-white'
              : 'text-gray-600 hover:text-card-dark hover:bg-gray-100'
          }`}
        >
          🎯 Budgets
        </Link>
        <Link
          to={`/stats${query}`}
          className={`px-4 py-2 rounded-2xl text-sm font-medium transition-all ${
            isActive('/stats')
              ? 'bg-card-dark text-white'
              : 'text-gray-600 hover:text-card-dark hover:bg-gray-100'
          }`}
        >
          📈 Analytics
        </Link>
      </div>
    </nav>
  );
}