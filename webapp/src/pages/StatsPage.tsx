import { useMemo, useState } from 'react';
import { formatAmount } from '../utils';
import { useTransactions } from '../hooks/useTransactions';
import { Transaction } from '../types';

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

  if (loading) return <div>Loading...</div>;
  if (error) return <div className="text-red-600">Error: {error}</div>;
  if (!userId) return <p>Please access this app through Telegram to see your statistics.</p>;

  const prevMonth = () => setMonthIndex(i => (i > 0 ? i - 1 : i));
  const nextMonth = () => setMonthIndex(i => (i < months.length - 1 ? i + 1 : i));

  return (
    <div>
      <h2 className="text-lg font-semibold mb-4">Statistics</h2>
      
      {/* Total Balance */}
      <div className="border rounded-lg p-4 mb-6 bg-gray-50">
        <div className="text-sm text-gray-500 mb-1">Total Balance</div>
        <div className={`text-2xl font-bold ${
          totalBalance >= 0 ? 'text-green-600' : 'text-red-600'
        }`}>
          {formatAmount(totalBalance)}
        </div>
      </div>

      {/* Monthly Stats */}
      {months.length > 0 && (
        <div className="border rounded-lg p-4">
          <div className="flex items-center justify-between mb-4">
            <button 
              className="px-3 py-1 bg-gray-200 rounded disabled:opacity-50"
              onClick={prevMonth}
              disabled={currentMonthIndex === 0}
            >
              &lt;
            </button>
            <span className="font-semibold">{monthStats.monthLabel}</span>
            <button 
              className="px-3 py-1 bg-gray-200 rounded disabled:opacity-50"
              onClick={nextMonth}
              disabled={currentMonthIndex === months.length - 1}
            >
              &gt;
            </button>
          </div>

          <div className="grid grid-cols-3 gap-4 mb-4">
            <div className="text-center">
              <div className="text-sm text-gray-500">Income</div>
              <div className="font-semibold text-green-600">
                +{formatAmount(monthStats.income)}
              </div>
            </div>
            <div className="text-center">
              <div className="text-sm text-gray-500">Expenses</div>
              <div className="font-semibold text-red-600">
                -{formatAmount(monthStats.expenses)}
              </div>
            </div>
            <div className="text-center">
              <div className="text-sm text-gray-500">Net</div>
              <div className={`font-semibold ${
                monthStats.monthSum >= 0 ? 'text-green-600' : 'text-red-600'
              }`}>
                {formatAmount(monthStats.monthSum)}
              </div>
            </div>
          </div>
        </div>
      )}

      {months.length === 0 && (
        <p className="text-gray-600">No data available for statistics.</p>
      )}
    </div>
  );
}