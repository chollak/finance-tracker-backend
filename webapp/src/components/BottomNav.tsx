import { useLocation, useNavigate } from 'react-router-dom';

const routes = [
  { path: '/', icon: '🏠', label: 'Home' },
  { path: '/dashboard', icon: '📊', label: 'Dashboard' },
  { path: '/transactions', icon: '💳', label: 'Transactions' },
  { path: '/budgets', icon: '💰', label: 'Budgets' },
  { path: '/stats', icon: '📈', label: 'Stats' },
];

export const BottomNav = () => {
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <nav className="fixed bottom-5 left-1/2 -translate-x-1/2 bg-card-dark rounded-full px-6 py-3 flex items-center gap-3 shadow-modal z-50 md:hidden">
      {routes.map((route) => {
        const isActive = location.pathname === route.path;

        return (
          <button
            key={route.path}
            onClick={() => navigate(route.path)}
            className={`
              w-14 h-14 rounded-full flex items-center justify-center text-xl transition-all duration-300 relative
              ${isActive ? 'bg-white text-card-dark' : 'text-gray-400 hover:text-white'}
            `}
            aria-label={route.label}
          >
            {isActive && (
              <span className="absolute inset-0 rounded-full bg-white animate-ripple" />
            )}
            <span className="relative z-10">{route.icon}</span>
          </button>
        );
      })}
    </nav>
  );
};
