import { Transaction } from '../types';
import { Badge } from '../design-system/components';

interface TransactionItemProps {
  transaction: Transaction;
  onEdit?: (transaction: Transaction) => void;
  onDelete?: (transaction: Transaction) => void;
}

const categoryIcons: Record<string, string> = {
  'Shopping': '🛍️',
  'Food & Drink': '🍽️',
  'Food': '🍽️',
  'Transport': '🚗',
  'Entertainment': '🎬',
  'Bills': '💡',
  'Utilities': '💡',
  'Freelance': '💼',
  'Salary': '💵',
  'Health': '💊',
  'Education': '📚',
  'Travel': '✈️',
  'Gifts': '🎁',
  'Other': '💰',
};

export const TransactionItem = ({ transaction, onEdit, onDelete }: TransactionItemProps) => {
  const icon = categoryIcons[transaction.category] || '💰';
  const amountPrefix = transaction.type === 'income' ? '+' : '-';
  const amountColor = transaction.type === 'income' ? 'text-green-income' : 'text-red-expense';
  const bgGradient = transaction.type === 'income'
    ? 'from-green-100 to-green-50'
    : 'from-red-100 to-red-50';

  return (
    <div className="flex items-center gap-3 bg-white p-4 rounded-2xl shadow-sm hover:shadow-md transition-all duration-200 group">
      {onDelete && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete(transaction);
          }}
          className="opacity-0 group-hover:opacity-100 transition-opacity text-red-500 hover:text-red-700 p-1"
          title="Delete transaction"
        >
          <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
          </svg>
        </button>
      )}

      <div
        className="flex items-center gap-3 flex-1 cursor-pointer"
        onClick={() => onEdit?.(transaction)}
      >
      {/* Icon */}
      <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${bgGradient} flex items-center justify-center text-xl flex-shrink-0`}>
        {icon}
      </div>

      {/* Details */}
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-card-dark truncate">{transaction.description}</div>
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <Badge variant="default">{transaction.category}</Badge>
          <span>{new Date(transaction.date).toLocaleDateString()}</span>
        </div>
      </div>

        {/* Amount */}
        <div className={`font-bold text-lg ${amountColor} whitespace-nowrap`}>
          {amountPrefix}${transaction.amount.toFixed(2)}
        </div>
      </div>
    </div>
  );
};
