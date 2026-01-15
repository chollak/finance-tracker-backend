import { useTransactions, TransactionListItem } from '@/entities/transaction';
import { useUserStore } from '@/entities/user';
import { FilterBar, useTransactionFiltersStore, filterTransactions } from '@/features/filter-transactions';
import { useDeleteTransactionDialog } from '@/features/delete-transaction';
import { Button } from '@/shared/ui/button';
import { Skeleton } from '@/shared/ui/skeleton';
import { Plus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { ROUTES } from '@/shared/lib/constants/routes';

/**
 * Transactions Page
 * Shows list of all transactions with filtering capabilities
 */
export function TransactionsPage() {
  const navigate = useNavigate();
  const userId = useUserStore((state) => state.userId);
  const { data: transactions, isLoading } = useTransactions(userId);
  const { DialogComponent, openDialog } = useDeleteTransactionDialog();

  // Filters from Zustand store
  const { searchQuery, typeFilter, categoryFilter } = useTransactionFiltersStore();

  // Apply filters
  const filteredTransactions = transactions
    ? filterTransactions(transactions, {
        searchQuery,
        typeFilter,
        categoryFilter,
      })
    : [];

  return (
    <div className="container mx-auto px-4 py-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Транзакции</h1>
        <p className="text-muted-foreground mt-1" role="status" aria-live="polite">
          {filteredTransactions.length} {filteredTransactions.length === 1 ? 'транзакция' : 'транзакций'}
        </p>
      </div>

      {/* Filter Bar */}
      <FilterBar />

      {/* Transactions List */}
      <div className="mt-6 space-y-3">
        {isLoading ? (
          <>
            {[1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-20 w-full" />
            ))}
          </>
        ) : filteredTransactions.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground">
              {transactions && transactions.length > 0
                ? 'Нет транзакций, соответствующих фильтрам'
                : 'У вас пока нет транзакций'}
            </p>
            <Button
              variant="link"
              onClick={() => navigate(ROUTES.ADD_TRANSACTION)}
              className="mt-2"
            >
              Добавить первую транзакцию →
            </Button>
          </div>
        ) : (
          filteredTransactions.map((transaction) => (
            <div key={transaction.id} className="flex items-center gap-2">
              <div className="flex-1">
                <TransactionListItem
                  transaction={transaction}
                  onClick={() => transaction.id && navigate(ROUTES.EDIT_TRANSACTION(transaction.id))}
                />
              </div>
              {transaction.id && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="cursor-pointer"
                  onClick={() => openDialog(transaction.id!)}
                  aria-label={`Удалить транзакцию ${transaction.description || ''}`}
                >
                  Удалить
                </Button>
              )}
            </div>
          ))
        )}
      </div>

      {/* Floating Action Button - Add Transaction */}
      <Button
        size="lg"
        className="fixed bottom-20 md:bottom-6 right-6 h-14 w-14 rounded-full shadow-lg md:h-auto md:w-auto md:rounded-md md:px-6"
        onClick={() => navigate(ROUTES.ADD_TRANSACTION)}
        aria-label="Добавить транзакцию"
      >
        <Plus className="h-6 w-6 md:mr-2" aria-hidden="true" />
        <span className="hidden md:inline">Добавить</span>
      </Button>

      {/* Delete Confirmation Dialog */}
      {DialogComponent}
    </div>
  );
}
