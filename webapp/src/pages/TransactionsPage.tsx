import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { formatAmount } from '../utils';
import { useTransactions } from '../hooks/useTransactions';
import { Transaction } from '../types';
import EditTransactionModal from '../components/EditTransactionModal';
import ConfirmDialog from '../components/ConfirmDialog';

interface TransactionsPageProps {
  userId: string | null;
}

export default function TransactionsPage({ userId }: TransactionsPageProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const { transactions, loading, error, deleteTransaction, updateTransaction, clearError } = useTransactions(userId);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [deletingTransaction, setDeletingTransaction] = useState<Transaction | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Handle edit parameter from URL
  useEffect(() => {
    const editId = searchParams.get('edit');
    if (editId && transactions.length > 0 && !editingTransaction) {
      const transactionToEdit = transactions.find(tx => tx.id === editId);
      if (transactionToEdit) {
        setEditingTransaction(transactionToEdit);
        // Clean up URL parameter after opening modal
        const newSearchParams = new URLSearchParams(searchParams);
        newSearchParams.delete('edit');
        setSearchParams(newSearchParams, { replace: true });
      }
    }
  }, [searchParams, transactions, editingTransaction, setSearchParams]);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-center">
          <div className="animate-pulse text-gray-500">Loading transactions...</div>
        </div>
      </div>
    );
  }

  const handleEdit = (transaction: Transaction) => {
    setEditingTransaction(transaction);
    clearError();
  };

  const handleDelete = (transaction: Transaction) => {
    setDeletingTransaction(transaction);
    clearError();
  };

  const confirmDelete = async () => {
    if (!deletingTransaction?.id) return;
    
    setIsDeleting(true);
    const success = await deleteTransaction(deletingTransaction.id);
    setIsDeleting(false);
    
    if (success) {
      setDeletingTransaction(null);
    }
  };

  const handleUpdate = async (updates: Partial<Transaction>) => {
    if (!editingTransaction?.id) return false;
    return await updateTransaction(editingTransaction.id, updates);
  };

  if (error) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-center bg-red-50 border border-red-200 rounded-lg p-6 max-w-md">
          <div className="text-red-600 mb-4">
            <h3 className="font-semibold mb-2">Unable to load transactions</h3>
            <p className="text-sm">{error}</p>
          </div>
          <button 
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded transition-colors"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  if (!userId) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-center bg-yellow-50 border border-yellow-200 rounded-lg p-6 max-w-md">
          <div className="text-yellow-600">
            <h3 className="font-semibold mb-2">Access Required</h3>
            <p className="text-sm">Please access this app through Telegram to see your transactions.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-lg font-semibold mb-4">Your Transactions</h2>
      {transactions.length === 0 ? (
        <p className="text-gray-600">No transactions found.</p>
      ) : (
        <ul className="space-y-2">
          {transactions.map((tx, idx) => (
            <li key={tx.id || idx} className="border rounded p-3 shadow-sm">
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
              
              {/* Action buttons */}
              {tx.id && (
                <div className="flex gap-2 mt-3 pt-2 border-t border-gray-100">
                  <button
                    onClick={() => handleEdit(tx)}
                    className="flex-1 px-3 py-1 text-sm bg-blue-50 text-blue-600 border border-blue-200 rounded hover:bg-blue-100 transition-colors"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(tx)}
                    className="flex-1 px-3 py-1 text-sm bg-red-50 text-red-600 border border-red-200 rounded hover:bg-red-100 transition-colors"
                  >
                    Delete
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {/* Edit Transaction Modal */}
      <EditTransactionModal
        isOpen={!!editingTransaction}
        onClose={() => setEditingTransaction(null)}
        onSave={handleUpdate}
        transaction={editingTransaction}
      />

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        isOpen={!!deletingTransaction}
        onClose={() => setDeletingTransaction(null)}
        onConfirm={confirmDelete}
        title="Delete Transaction"
        message={`Are you sure you want to delete this transaction: "${deletingTransaction?.description}"? This action cannot be undone.`}
        confirmText="Delete"
        isLoading={isDeleting}
      />
    </div>
  );
}