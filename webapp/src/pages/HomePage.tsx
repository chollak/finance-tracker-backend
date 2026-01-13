import { useState, useEffect } from 'react';
import { Button, Avatar } from '../design-system/components';
import { BalanceCard } from '../components/BalanceCard';
import { useTransactions } from '../hooks/useTransactions';

interface HomePageProps {
  userId: string | null;
}

export default function HomePage({ userId }: HomePageProps) {
  const { transactions, loading } = useTransactions(userId || '');
  const [balance, setBalance] = useState(0);
  const [expenseChange] = useState(23); // Mock data for now

  useEffect(() => {
    if (transactions.length > 0) {
      const income = transactions
        .filter(t => t.type === 'income')
        .reduce((sum, t) => sum + t.amount, 0);

      const expense = transactions
        .filter(t => t.type === 'expense')
        .reduce((sum, t) => sum + t.amount, 0);

      setBalance(income - expense);
    }
  }, [transactions]);

  if (!userId) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center max-w-md">
          <h2 className="text-2xl font-bold mb-4 text-card-dark">Welcome to FinTrack!</h2>
          <p className="text-gray-600">
            Please access this app through Telegram to see your personal finance data.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto px-4 py-8 fade-in">
      {/* Header */}
      <header className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-4">
          <Avatar initials={userId?.substring(0, 2).toUpperCase() || 'U'} size="md" />
        </div>

        <div className="flex items-center gap-4">
          {/* Search Icon */}
          <button className="w-10 h-10 flex items-center justify-center hover:bg-gray-200 rounded-full transition">
            <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8"/>
              <path d="m21 21-4.35-4.35"/>
            </svg>
          </button>

          {/* Notifications Icon */}
          <button className="w-10 h-10 flex items-center justify-center hover:bg-gray-200 rounded-full transition relative">
            <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
              <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
            </svg>
          </button>
        </div>
      </header>

      {/* Page Title */}
      <h1 className="text-4xl md:text-5xl font-bold mb-2">Your Finance</h1>
      <h1 className="text-4xl md:text-5xl font-bold mb-8">Overview</h1>

      {/* Balance Card */}
      {loading ? (
        <div className="animate-pulse">
          <div className="h-48 bg-gray-200 rounded-4xl mb-6"></div>
        </div>
      ) : (
        <div className="mb-6">
          <BalanceCard balance={balance} expenseChange={expenseChange} />
        </div>
      )}

      {/* Action Buttons */}
      <div className="grid grid-cols-2 gap-4 mb-8">
        <Button
          variant="lime"
          size="lg"
          leftIcon={
            <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="m5 12 14 0"/>
              <path d="m12 5 7 7-7 7"/>
            </svg>
          }
        >
          Transfer
        </Button>

        <Button
          variant="lavender"
          size="lg"
          leftIcon={
            <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="m19 12-14 0"/>
              <path d="m12 19-7-7 7-7"/>
            </svg>
          }
        >
          Request
        </Button>
      </div>

      {/* Recent Transfer */}
      <div className="mb-8">
        <p className="text-sm font-semibold mb-4 text-gray-700">Recent transfer</p>
        <div className="flex items-center gap-4 overflow-x-auto pb-2">
          {['JC', 'SM', 'AR', 'LM', 'DK'].map((initials, index) => (
            <Avatar
              key={index}
              initials={initials}
              size="md"
              className="flex-shrink-0"
            />
          ))}

          {/* Add Widget Button */}
          <button className="flex-shrink-0 w-12 h-12 rounded-full border-2 border-dashed border-gray-300 flex items-center justify-center hover:border-gray-400 transition">
            <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 5v14M5 12h14"/>
            </svg>
          </button>
          <span className="flex-shrink-0 text-xs text-gray-500 whitespace-nowrap">Add widget</span>
        </div>
      </div>
    </div>
  );
}