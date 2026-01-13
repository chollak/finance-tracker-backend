import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTransactions } from '../hooks/useTransactions';
import { Transaction } from '../types';
import EditTransactionModal from '../components/EditTransactionModal';
import ConfirmDialog from '../components/ConfirmDialog';
import { TransactionItem } from '../components/TransactionItem';
import { groupTransactionsByDate } from '../utils/groupTransactions';

interface TransactionsPageProps {
  userId: string | null;
}

export default function TransactionsPage({ userId }: TransactionsPageProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const { transactions, loading, error, deleteTransaction, updateTransaction, clearError } = useTransactions(userId);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [deletingTransaction, setDeletingTransaction] = useState<Transaction | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<string>('all');

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

  // Filter transactions
  const filteredTransactions = transactions.filter(tx => {
    // Search filter
    const matchesSearch = searchQuery === '' ||
      tx.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      tx.category.toLowerCase().includes(searchQuery.toLowerCase());

    // Category/type filter
    const matchesFilter = activeFilter === 'all' ||
      activeFilter === tx.type ||
      activeFilter === tx.category;

    return matchesSearch && matchesFilter;
  });

  // Get unique categories for filter pills
  const categories = Array.from(new Set(transactions.map(t => t.category))).slice(0, 5);

  // Group filtered transactions
  const groupedTransactions = groupTransactionsByDate(filteredTransactions);

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 fade-in">
      <h2 className="text-2xl font-bold mb-6 text-card-dark">Transactions</h2>

      {/* Search */}
      <div className="relative mb-4">
        <input
          type="text"
          placeholder="Search transactions..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full px-4 py-3 pr-10 bg-white rounded-2xl border border-gray-200 focus:outline-none focus:border-gray-300 transition"
        />
        <svg
          className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <circle cx="11" cy="11" r="8"/>
          <path d="m21 21-4.35-4.35"/>
        </svg>
      </div>

      {/* Filter Pills */}
      <div className="flex gap-2 overflow-x-auto pb-2 mb-6 scrollbar-hide">
        <button
          onClick={() => setActiveFilter('all')}
          className={`flex-shrink-0 px-4 py-2 rounded-full text-sm font-medium transition-all ${
            activeFilter === 'all'
              ? 'bg-card-dark text-white'
              : 'bg-white text-gray-600 border border-gray-200 hover:border-gray-300'
          }`}
        >
          All
        </button>
        <button
          onClick={() => setActiveFilter('income')}
          className={`flex-shrink-0 px-4 py-2 rounded-full text-sm font-medium transition-all ${
            activeFilter === 'income'
              ? 'bg-card-dark text-white'
              : 'bg-white text-gray-600 border border-gray-200 hover:border-gray-300'
          }`}
        >
          Income
        </button>
        <button
          onClick={() => setActiveFilter('expense')}
          className={`flex-shrink-0 px-4 py-2 rounded-full text-sm font-medium transition-all ${
            activeFilter === 'expense'
              ? 'bg-card-dark text-white'
              : 'bg-white text-gray-600 border border-gray-200 hover:border-gray-300'
          }`}
        >
          Expense
        </button>
        {categories.map(category => (
          <button
            key={category}
            onClick={() => setActiveFilter(category)}
            className={`flex-shrink-0 px-4 py-2 rounded-full text-sm font-medium transition-all ${
              activeFilter === category
                ? 'bg-card-dark text-white'
                : 'bg-white text-gray-600 border border-gray-200 hover:border-gray-300'
            }`}
          >
            {category}
          </button>
        ))}
      </div>

      {/* Transactions List */}
      {filteredTransactions.length === 0 ? (
        <div className="text-center py-12">
          <div className="text-gray-400 mb-4">
            <svg className="w-16 h-16 mx-auto mb-4 opacity-30" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-gray-700 mb-2">No transactions found</h3>
          <p className="text-sm text-gray-500">
            {searchQuery || activeFilter !== 'all'
              ? 'Try adjusting your filters or search query'
              : 'Start tracking your finances by adding your first transaction'}
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {['Today', 'Yesterday', 'This Week', 'Earlier'].map(groupName => {
            const groupTransactions = groupedTransactions[groupName];
            if (groupTransactions.length === 0) return null;

            return (
              <div key={groupName}>
                <h3 className="text-sm font-semibold text-gray-500 mb-3">{groupName}</h3>
                <div className="space-y-3">
                  {groupTransactions.map((tx, idx) => (
                    <TransactionItem
                      key={tx.id || idx}
                      transaction={tx}
                      onEdit={() => handleEdit(tx)}
                      onDelete={tx.id ? () => handleDelete(tx) : undefined}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
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