import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Search, Bell, Plus, ArrowRight, ArrowLeft } from 'lucide-react';
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

        <div className="flex items-center gap-4">
          {/* Search Button */}
          <Button variant="ghost" size="icon" className="rounded-full">
            <Search className="h-5 w-5" />
          </Button>

          {/* Notifications Button */}
          <Button variant="ghost" size="icon" className="rounded-full">
            <Bell className="h-5 w-5" />
          </Button>
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
          <BalanceCard balance={balance} expenseChange={expenseChange} />
        </div>
      )}

      {/* Action Buttons */}
      <div className="grid grid-cols-2 gap-4 mb-8">
        <Button size="lg" className="gap-2">
          <ArrowRight className="h-5 w-5" />
          Transfer
        </Button>

        <Button variant="secondary" size="lg" className="gap-2">
          <ArrowLeft className="h-5 w-5" />
          Request
        </Button>
      </div>

      {/* Recent Transfer */}
      <div className="mb-8">
        <p className="text-sm font-semibold mb-4">Recent transfer</p>
        <div className="flex items-center gap-4 overflow-x-auto pb-2">
          {['JC', 'SM', 'AR', 'LM', 'DK'].map((initials, index) => (
            <Avatar key={index} className="flex-shrink-0">
              <AvatarFallback>{initials}</AvatarFallback>
            </Avatar>
          ))}

          {/* Add Widget Button */}
          <button className="flex-shrink-0 w-12 h-12 rounded-full border-2 border-dashed border-gray-300 flex items-center justify-center hover:border-gray-400 transition">
            <Plus className="h-5 w-5" />
          </button>
          <span className="flex-shrink-0 text-xs text-muted-foreground whitespace-nowrap">Add widget</span>
        </div>
      </div>
    </div>
  );
}