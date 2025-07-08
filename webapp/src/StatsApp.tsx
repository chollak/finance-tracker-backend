import { useEffect, useState } from 'react';

interface Transaction {
  date: string;
  category: string;
  description: string;
  amount: number;
  type: 'income' | 'expense';
  userId: string;
  userName?: string;
}

type Month = { month: number; year: number };

export default function StatsApp() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [months, setMonths] = useState<Month[]>([]);
  const [index, setIndex] = useState(0);
  const params = new URLSearchParams(window.location.search);
  const userIdParam = params.get('userId');

  useEffect(() => {
    if (!userIdParam) {
      setLoading(false);
      return;
    }

    fetch(`/api/transactions/user/${userIdParam}`)
      .then(res => res.json())
      .then(data => {
        setTransactions(data);
        const setMonth = new Set(
          data.map((t: Transaction) => {
            const d = new Date(t.date);
            return `${d.getFullYear()}-${d.getMonth()}`;
          })
        );
        const list = Array.from(setMonth)
          .map(str => {
            const [y, m] = str.split('-').map(Number);
            return { year: y, month: m } as Month;
          })
          .sort((a, b) =>
            a.year === b.year ? a.month - b.month : a.year - b.year
          );
        setMonths(list);
        setIndex(list.length > 0 ? list.length - 1 : 0);
      })
      .catch(err => console.error('Failed to fetch transactions', err))
      .finally(() => setLoading(false));
  }, []);

  const calcSum = (items: Transaction[]) =>
    items.reduce(
      (sum, t) => sum + (t.type === 'expense' ? -t.amount : t.amount),
      0
    );

  if (loading) {
    return <div className="p-4">Loading...</div>;
  }

  const total = calcSum(transactions);

  let monthLabel = '-';
  let monthSum = 0;
  if (months.length > 0) {
    const { year, month } = months[index];
    const filtered = transactions.filter(t => {
      const d = new Date(t.date);
      return d.getFullYear() === year && d.getMonth() === month;
    });
    monthSum = calcSum(filtered);
    monthLabel = new Date(year, month).toLocaleString('default', {
      month: 'long',
      year: 'numeric'
    });
  }

  const prev = () => setIndex(i => (i > 0 ? i - 1 : i));
  const next = () => setIndex(i => (i < months.length - 1 ? i + 1 : i));

  return (
    <div className="p-4">
      <h1 className="text-xl font-bold mb-4">Statistics</h1>
      <nav className="mb-4">
        <a
          className="text-blue-600 underline"
          href={`/webapp/transactions.html${userIdParam ? `?userId=${userIdParam}` : ''}`}
        >
          Back to Transactions
        </a>
      </nav>
      <div className="border rounded p-4 mb-4">
        <div className="text-sm text-gray-500">Total</div>
        <div className="text-lg font-semibold">{total}</div>
      </div>
      <div className="border rounded p-4">
        <div className="flex items-center justify-between mb-2">
          <button className="px-2" onClick={prev}>&lt;</button>
          <span>{monthLabel}</span>
          <button className="px-2" onClick={next}>&gt;</button>
        </div>
        <div className="text-lg font-semibold">{monthSum}</div>
      </div>
    </div>
  );
}
