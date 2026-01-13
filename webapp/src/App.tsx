import { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, useSearchParams } from 'react-router-dom';
import Navigation from './components/Navigation';
import { BottomNav } from './components/BottomNav';
import { DevMode } from './components/DevMode';
import TransactionsPage from './pages/TransactionsPage';
import StatsPage from './pages/StatsPage';
import HomePage from './pages/HomePage';
import BudgetsPage from './pages/BudgetsPage';
import DashboardPage from './pages/DashboardPage';
import { config } from './config/env';
import { OpenAIUsageProvider } from './contexts/OpenAIUsageContext';

function AppContent() {
  const [searchParams] = useSearchParams();
  const userId = searchParams.get('userId') || config.getUserId();

  useEffect(() => {
    // Debug logging
    console.log('🚀 App loading...', {
      isDevelopment: config.isDevelopment,
      userId: userId,
      apiBase: config.apiBase
    });

    if (window.Telegram?.WebApp) {
      window.Telegram.WebApp.ready();
      window.Telegram.WebApp.expand();
      
      // Log Telegram WebApp info in development
      config.log.debug('Telegram WebApp initialized', {
        initDataUnsafe: window.Telegram.WebApp.initDataUnsafe,
        colorScheme: window.Telegram.WebApp.colorScheme
      });
    } else {
      config.log.info('Running in browser mode (not Telegram WebApp)');
    }
  }, []);

  return (
    <div className="min-h-screen pb-24 md:pb-0">
      <div className="p-4">
        <DevMode />
        <h1 className="text-xl font-bold mb-4 text-card-dark">FinTrack WebApp</h1>
        <Navigation userId={userId || undefined} />

        <Routes>
          <Route path="/" element={<HomePage userId={userId} />} />
          <Route path="/dashboard" element={<DashboardPage userId={userId} />} />
          <Route path="/transactions" element={<TransactionsPage userId={userId} />} />
          <Route path="/budgets" element={<BudgetsPage userId={userId} />} />
          <Route path="/stats" element={<StatsPage userId={userId} />} />
        </Routes>
      </div>

      <BottomNav />
    </div>
  );
}

export default function App() {
  return (
    <Router>
      <OpenAIUsageProvider>
        <AppContent />
      </OpenAIUsageProvider>
    </Router>
  );
}
