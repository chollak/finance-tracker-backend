import { formatAmount } from '../utils';
import { useTransactions } from '../hooks/useTransactions';

interface TransactionsPageProps {
  userId: string | null;
}

export default function TransactionsPage({ userId }: TransactionsPageProps) {
  const { transactions, loading, error } = useTransactions(userId);

  if (loading) {
    return <div>Loading...</div>;
  }

  if (error) {
    return (
      <div className="text-red-600">
        <p>Error: {error}</p>
        <button 
          onClick={() => window.location.reload()}
          className="mt-2 px-4 py-2 bg-blue-500 text-white rounded"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!userId) {
    return <p>Please access this app through Telegram to see your transactions.</p>;
  }

  return (
    <div>
      <h2 className="text-lg font-semibold mb-4">Your Transactions</h2>
      {transactions.length === 0 ? (
        <p className="text-gray-600">No transactions found.</p>
      ) : (
        <ul className="space-y-2">
          {transactions.map((tx, idx) => (
            <li key={idx} className="border rounded p-3 shadow-sm">
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <div className="text-sm text-gray-500">
                    {new Date(tx.date).toLocaleDateString()}
                  </div>
                  <div className="font-semibold text-gray-800">{tx.category}</div>
                  <div className="text-sm text-gray-600">{tx.description}</div>
                </div>
                <div className="text-right">
                  <div className={`font-semibold ${
                    tx.type === 'income' ? 'text-green-600' : 'text-red-600'
                  }`}>
                    {tx.type === 'income' ? '+' : '-'}{formatAmount(tx.amount)}
                  </div>
                  <div className="text-xs text-gray-500 capitalize">{tx.type}</div>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}