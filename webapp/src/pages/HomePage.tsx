import { useState, useEffect } from 'react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { BalanceCard } from '../components/BalanceCard';
import { useTransactions } from '../hooks/useTransactions';

interface HomePageProps {
  userId: string | null;
}

export default function HomePage({ userId }: HomePageProps) {
  const { transactions, loading } = useTransactions(userId || '');
  const [balance, setBalance] = useState(0);

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
          <h2 className="text-2xl font-bold mb-4">Welcome to FinTrack!</h2>
          <p className="text-muted-foreground">
            Please access this app through Telegram to see your personal finance data.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto px-4 py-8">
      {/* Header */}
      <header className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-4">
          <Avatar>
            <AvatarFallback>{userId?.substring(0, 2).toUpperCase() || 'U'}</AvatarFallback>
          </Avatar>
        </div>
      </header>

      {/* Page Title */}
      <h1 className="text-4xl md:text-5xl font-bold mb-2">Your Finance</h1>
      <h1 className="text-4xl md:text-5xl font-bold mb-8">Overview</h1>

      {/* Balance Card */}
      {loading ? (
        <div className="animate-pulse">
          <div className="h-48 bg-gray-200 rounded-3xl mb-6"></div>
        </div>
      ) : (
        <div className="mb-6">
          <BalanceCard balance={balance} expenseChange={0} />
        </div>
      )}

    </div>
  );
}