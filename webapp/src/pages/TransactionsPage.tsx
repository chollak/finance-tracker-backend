import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTransactions } from '../hooks/useTransactions';
import { Transaction } from '../types';
import EditTransactionModal from '../components/EditTransactionModal';
import ConfirmDialog from '../components/ConfirmDialog';
import { TransactionItem } from '../components/TransactionItem';
import { groupTransactionsByDate } from '../utils/groupTransactions';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Search, Wallet, AlertCircle } from 'lucide-react';

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
          <div className="animate-pulse text-muted-foreground">Loading transactions...</div>
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
        <Alert variant="destructive" className="max-w-md">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Unable to load transactions</AlertTitle>
          <AlertDescription className="mt-2">
            {error}
            <Button
              onClick={() => window.location.reload()}
              variant="outline"
              size="sm"
              className="mt-4"
            >
              Try Again
            </Button>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  if (!userId) {
    return (
      <div className="flex items-center justify-center p-8">
        <Alert className="max-w-md bg-yellow-50 border-yellow-200">
          <AlertCircle className="h-4 w-4 text-yellow-600" />
          <AlertTitle className="text-yellow-800">Access Required</AlertTitle>
          <AlertDescription className="text-yellow-700">
            Please access this app through Telegram to see your transactions.
          </AlertDescription>
        </Alert>
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
    <div className="max-w-4xl mx-auto px-4 py-8">
      <h2 className="text-2xl font-bold mb-6">Transactions</h2>

      {/* Search */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
        <Input
          type="text"
          placeholder="Search transactions..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Filter Pills */}
      <div className="flex gap-2 overflow-x-auto pb-2 mb-6 scrollbar-hide">
        <button
          onClick={() => setActiveFilter('all')}
          className={`flex-shrink-0 px-4 py-2 rounded-full text-sm font-medium transition-all ${
            activeFilter === 'all'
              ? 'bg-primary text-primary-foreground'
              : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
          }`}
        >
          All
        </button>
        <button
          onClick={() => setActiveFilter('income')}
          className={`flex-shrink-0 px-4 py-2 rounded-full text-sm font-medium transition-all ${
            activeFilter === 'income'
              ? 'bg-primary text-primary-foreground'
              : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
          }`}
        >
          Income
        </button>
        <button
          onClick={() => setActiveFilter('expense')}
          className={`flex-shrink-0 px-4 py-2 rounded-full text-sm font-medium transition-all ${
            activeFilter === 'expense'
              ? 'bg-primary text-primary-foreground'
              : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
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
                ? 'bg-primary text-primary-foreground'
                : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
            }`}
          >
            {category}
          </button>
        ))}
      </div>

      {/* Transactions List */}
      {filteredTransactions.length === 0 ? (
        <div className="text-center py-12">
          <Wallet className="w-16 h-16 mx-auto mb-4 text-muted-foreground opacity-30" />
          <h3 className="text-lg font-semibold mb-2">No transactions found</h3>
          <p className="text-sm text-muted-foreground">
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
                <h3 className="text-sm font-semibold text-muted-foreground mb-3">{groupName}</h3>
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