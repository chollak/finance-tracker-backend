import { Link, useLocation } from 'react-router-dom';

interface NavigationProps {
  userId?: string;
}

export default function Navigation({ userId }: NavigationProps) {
  const location = useLocation();
  const query = userId ? `?userId=${userId}` : '';

  const isActive = (path: string) => location.pathname === path;

  return (
    <nav className="mb-4 space-x-4">
      <Link
        to={`/${query}`}
        className={`underline ${
          isActive('/') ? 'text-blue-800 font-semibold' : 'text-blue-600'
        }`}
      >
        Home
      </Link>
      <Link
        to={`/transactions${query}`}
        className={`underline ${
          isActive('/transactions') ? 'text-blue-800 font-semibold' : 'text-blue-600'
        }`}
      >
        Transactions
      </Link>
      <Link
        to={`/stats${query}`}
        className={`underline ${
          isActive('/stats') ? 'text-blue-800 font-semibold' : 'text-blue-600'
        }`}
      >
        Stats
      </Link>
    </nav>
  );
}