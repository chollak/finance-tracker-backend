import { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, useSearchParams } from 'react-router-dom';
import Navigation from './components/Navigation';
import TransactionsPage from './pages/TransactionsPage';
import StatsPage from './pages/StatsPage';
import HomePage from './pages/HomePage';
import BudgetsPage from './pages/BudgetsPage';
import DashboardPage from './pages/DashboardPage';

function AppContent() {
  const [searchParams] = useSearchParams();
  const userId = searchParams.get('userId');

  useEffect(() => {
    window.Telegram?.WebApp?.ready();
  }, []);

  return (
    <div className="p-4">
      <h1 className="text-xl font-bold mb-4">FinTrack WebApp</h1>
      <Navigation userId={userId || undefined} />
      
      <Routes>
        <Route path="/" element={<HomePage userId={userId} />} />
        <Route path="/dashboard" element={<DashboardPage userId={userId} />} />
        <Route path="/transactions" element={<TransactionsPage userId={userId} />} />
        <Route path="/budgets" element={<BudgetsPage userId={userId} />} />
        <Route path="/stats" element={<StatsPage userId={userId} />} />
      </Routes>
    </div>
  );
}

export default function App() {
  return (
    <Router basename="/webapp">
      <AppContent />
    </Router>
  );
}
