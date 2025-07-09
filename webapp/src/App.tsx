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

  const params = new URLSearchParams(window.location.search);
  const userId = params.get('userId');
  const query = userId ? `?userId=${userId}` : '';

  return (
    <div className="p-4">
      <h1 className="text-xl font-bold mb-4">FinTrack WebApp</h1>
      <nav className="space-x-4">
        <a
          className="text-blue-600 underline"
          href={`/webapp/transactions.html${query}`}
        >
          Transactions
        </a>
        <a
          className="text-blue-600 underline"
          href={`/webapp/stats.html${query}`}
        >
          Stats
        </a>
      </nav>
    </div>
  );
}
