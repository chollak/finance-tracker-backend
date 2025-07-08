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

export default function TransactionsApp() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const params = new URLSearchParams(window.location.search);
  const userIdParam = params.get('userId');

  useEffect(() => {
    if (!userIdParam) {
      setLoading(false);
      return;
    }

    fetch(`/api/transactions/user/${userIdParam}`)
      .then(res => res.json())
      .then(data => setTransactions(data))
      .catch(err => console.error('Failed to fetch transactions', err))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="p-4">Loading...</div>;
  }

  return (
    <div className="p-4">
      <h1 className="text-xl font-bold mb-4">Transactions</h1>
      <nav className="mb-4">
        <a
          className="text-blue-600 underline"
          href={`/webapp/stats.html${userIdParam ? `?userId=${userIdParam}` : ''}`}
        >
          View Stats
        </a>
      </nav>
      {transactions.length === 0 ? (
        <p>No transactions found.</p>
      ) : (
        <ul className="space-y-2">
          {transactions.map((tx, idx) => (
            <li key={idx} className="border rounded p-2">
              <div className="text-sm text-gray-500">{new Date(tx.date).toLocaleDateString()}</div>
              <div className="font-semibold">{tx.category}</div>
              <div>{tx.description}</div>
              <div>{tx.amount}</div>
              <div className="text-sm text-gray-600">{tx.type}</div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
