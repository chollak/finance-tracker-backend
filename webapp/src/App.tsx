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
      <h1 className="text-xl font-bold">FinTrack WebApp</h1>
    </div>
  );
}
