import { useEffect } from 'react';

declare global {
  interface Window {
    Telegram?: { WebApp: any };
  }
}

export default function App() {
  useEffect(() => {
    window.Telegram?.WebApp?.ready();
  }, []);

  return (
    <div className="p-4">
      <h1 className="text-xl font-bold mb-4">FinTrack WebApp</h1>
      <nav className="space-x-4">
        <a className="text-blue-600 underline" href="/webapp/transactions.html">
          Transactions
        </a>
        <a className="text-blue-600 underline" href="/webapp/stats.html">
          Stats
        </a>
      </nav>
    </div>
  );
}
