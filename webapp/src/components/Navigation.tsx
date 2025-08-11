import { Link, useLocation } from 'react-router-dom';

interface NavigationProps {
  userId?: string;
}

export default function Navigation({ userId }: NavigationProps) {
  const location = useLocation();
  const query = userId ? `?userId=${userId}` : '';

  const isActive = (path: string) => location.pathname === path;

  return (
    <nav className="mb-6 border-b pb-4">
      <div className="flex flex-wrap gap-4">
        <Link
          to={`/${query}`}
          className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
            isActive('/') 
              ? 'bg-blue-100 text-blue-800' 
              : 'text-gray-600 hover:text-blue-600 hover:bg-gray-100'
          }`}
        >
          🏠 Home
        </Link>
        <Link
          to={`/dashboard${query}`}
          className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
            isActive('/dashboard') 
              ? 'bg-blue-100 text-blue-800' 
              : 'text-gray-600 hover:text-blue-600 hover:bg-gray-100'
          }`}
        >
          📊 Dashboard
        </Link>
        <Link
          to={`/transactions${query}`}
          className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
            isActive('/transactions') 
              ? 'bg-blue-100 text-blue-800' 
              : 'text-gray-600 hover:text-blue-600 hover:bg-gray-100'
          }`}
        >
          💳 Transactions
        </Link>
        <Link
          to={`/budgets${query}`}
          className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
            isActive('/budgets') 
              ? 'bg-blue-100 text-blue-800' 
              : 'text-gray-600 hover:text-blue-600 hover:bg-gray-100'
          }`}
        >
          🎯 Budgets
        </Link>
        <Link
          to={`/stats${query}`}
          className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
            isActive('/stats') 
              ? 'bg-blue-100 text-blue-800' 
              : 'text-gray-600 hover:text-blue-600 hover:bg-gray-100'
          }`}
        >
          📈 Analytics
        </Link>
      </div>
    </nav>
  );
}