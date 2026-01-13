import { useMemo, useState } from 'react';
import { formatAmount } from '../utils';
import { useTransactions } from '../hooks/useTransactions';
import { Transaction } from '../types';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

interface StatsPageProps {
  userId: string | null;
}

type Month = { month: number; year: number };

export default function StatsPage({ userId }: StatsPageProps) {
  const { transactions, loading, error } = useTransactions(userId);
  const [monthIndex, setMonthIndex] = useState(0);

  const { months, totalBalance } = useMemo(() => {
    if (transactions.length === 0) return { months: [], totalBalance: 0 };

    const uniqueMonths = new Set(
      transactions.map((t: Transaction) => {
        const d = new Date(t.date);
        return `${d.getFullYear()}-${d.getMonth()}`;
      })
    );

    const monthsList = Array.from(uniqueMonths)
      .map(str => {
        const [y, m] = str.split('-').map(Number);
        return { year: y, month: m } as Month;
      })
      .sort((a, b) => (a.year === b.year ? a.month - b.month : a.year - b.year));

    const total = transactions.reduce(
      (sum, t) => sum + (t.type === 'expense' ? -t.amount : t.amount),
      0
    );

    return { months: monthsList, totalBalance: total };
  }, [transactions]);

  // Set initial month index to the latest month
  const currentMonthIndex = months.length > 0 ? Math.min(monthIndex, months.length - 1) : 0;

  const monthStats = useMemo(() => {
    if (months.length === 0) return { monthLabel: '-', monthSum: 0, income: 0, expenses: 0 };

    const { year, month } = months[currentMonthIndex];
    const monthTransactions = transactions.filter(t => {
      const d = new Date(t.date);
      return d.getFullYear() === year && d.getMonth() === month;
    });

    const income = monthTransactions
      .filter(t => t.type === 'income')
      .reduce((sum, t) => sum + t.amount, 0);

    const expenses = monthTransactions
      .filter(t => t.type === 'expense')
      .reduce((sum, t) => sum + t.amount, 0);

    const monthSum = income - expenses;
    const monthLabel = new Date(year, month).toLocaleString('default', {
      month: 'long',
      year: 'numeric'
    });

    return { monthLabel, monthSum, income, expenses };
  }, [transactions, months, currentMonthIndex]);

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
    </div>
  );
  if (error) return <div className="text-red-expense">Error: {error}</div>;
  if (!userId) return <p className="text-muted-foreground">Please access this app through Telegram to see your statistics.</p>;

  const prevMonth = () => setMonthIndex(i => (i > 0 ? i - 1 : i));
  const nextMonth = () => setMonthIndex(i => (i < months.length - 1 ? i + 1 : i));

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <h2 className="text-2xl font-bold mb-6">Statistics</h2>

      {/* Total Balance */}
      <Card className="mb-6">
        <CardContent className="pt-6">
          <div className="text-sm text-muted-foreground mb-1">Total Balance</div>
          <div className={`text-3xl font-bold ${
            totalBalance >= 0 ? 'text-green-income' : 'text-red-expense'
          }`}>
            {formatAmount(totalBalance)}
          </div>
        </CardContent>
      </Card>

      {/* Monthly Stats */}
      {months.length > 0 && (
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between mb-4">
              <Button
                onClick={prevMonth}
                disabled={currentMonthIndex === 0}
                variant="secondary"
                size="sm"
              >
                &lt;
              </Button>
              <span className="font-semibold">{monthStats.monthLabel}</span>
              <Button
                onClick={nextMonth}
                disabled={currentMonthIndex === months.length - 1}
                variant="secondary"
                size="sm"
              >
                &gt;
              </Button>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="text-center">
                <div className="text-sm text-muted-foreground">Income</div>
                <div className="font-semibold text-green-income text-lg">
                  +{formatAmount(monthStats.income)}
                </div>
              </div>
              <div className="text-center">
                <div className="text-sm text-muted-foreground">Expenses</div>
                <div className="font-semibold text-red-expense text-lg">
                  -{formatAmount(monthStats.expenses)}
                </div>
              </div>
              <div className="text-center">
                <div className="text-sm text-muted-foreground">Net</div>
                <div className={`font-semibold text-lg ${
                  monthStats.monthSum >= 0 ? 'text-green-income' : 'text-red-expense'
                }`}>
                  {formatAmount(monthStats.monthSum)}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {months.length === 0 && (
        <p className="text-muted-foreground">No data available for statistics.</p>
      )}
    </div>
  );
}