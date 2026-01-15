import { useState } from 'react';
import {
  useTransactions,
  useArchivedTransactions,
  useArchiveTransaction,
  useUnarchiveTransaction,
  useArchiveAllTransactions,
  TransactionListItem,
} from '@/entities/transaction';
import { useUserStore } from '@/entities/user';
import { FilterBar, useTransactionFiltersStore, filterTransactions } from '@/features/filter-transactions';
import { useDeleteTransactionDialog } from '@/features/delete-transaction';
import { Button } from '@/shared/ui/button';
import { Skeleton } from '@/shared/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/shared/ui/tabs';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/shared/ui/alert-dialog';
import { Plus, Archive, ArchiveRestore } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { ROUTES } from '@/shared/lib/constants/routes';
import { toast } from 'sonner';

/**
 * Transactions Page
 * Shows list of all transactions with filtering and archive capabilities
 */
export function TransactionsPage() {
  const navigate = useNavigate();
  const userId = useUserStore((state) => state.userId);
  const [activeTab, setActiveTab] = useState<'active' | 'archived'>('active');

  // Active transactions
  const { data: transactions, isLoading: isLoadingActive } = useTransactions(userId);
  // Archived transactions
  const { data: archivedTransactions, isLoading: isLoadingArchived } = useArchivedTransactions(userId);

  const { DialogComponent, openDialog } = useDeleteTransactionDialog();

  // Archive mutations
  const archiveMutation = useArchiveTransaction();
  const unarchiveMutation = useUnarchiveTransaction();
  const archiveAllMutation = useArchiveAllTransactions();

  // Filters from Zustand store
  const { searchQuery, typeFilter, categoryFilter } = useTransactionFiltersStore();

  // Apply filters to active transactions
  const filteredTransactions = transactions
    ? filterTransactions(transactions, {
        searchQuery,
        typeFilter,
        categoryFilter,
      })
    : [];

  // Apply filters to archived transactions
  const filteredArchivedTransactions = archivedTransactions
    ? filterTransactions(archivedTransactions, {
        searchQuery,
        typeFilter,
        categoryFilter,
      })
    : [];

  const handleArchive = async (id: string) => {
    try {
      await archiveMutation.mutateAsync(id);
      toast.success('Транзакция архивирована');
    } catch {
      toast.error('Не удалось архивировать транзакцию');
    }
  };

  const handleUnarchive = async (id: string) => {
    try {
      await unarchiveMutation.mutateAsync(id);
      toast.success('Транзакция восстановлена');
    } catch {
      toast.error('Не удалось восстановить транзакцию');
    }
  };

  const handleArchiveAll = async () => {
    if (!userId) return;
    try {
      const result = await archiveAllMutation.mutateAsync(userId);
      toast.success(`Архивировано ${result.archivedCount} транзакций`);
    } catch {
      toast.error('Не удалось архивировать транзакции');
    }
  };

  const currentTransactions = activeTab === 'active' ? filteredTransactions : filteredArchivedTransactions;
  const totalCount = activeTab === 'active' ? (transactions?.length || 0) : (archivedTransactions?.length || 0);

  return (
    <div className="container mx-auto px-4 py-6">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Транзакции</h1>
          <p className="text-muted-foreground mt-1" role="status" aria-live="polite">
            {currentTransactions.length} из {totalCount}{' '}
            {activeTab === 'active' ? 'активных' : 'в архиве'}
          </p>
        </div>
        {activeTab === 'active' && transactions && transactions.length > 0 && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2">
                <Archive className="h-4 w-4" />
                <span className="hidden sm:inline">Архивировать все</span>
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Архивировать все транзакции?</AlertDialogTitle>
                <AlertDialogDescription>
                  Все ваши текущие транзакции будут перемещены в архив.
                  Они не будут учитываться в балансе и аналитике.
                  Вы сможете восстановить их в любой момент.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Отмена</AlertDialogCancel>
                <AlertDialogAction onClick={handleArchiveAll}>
                  Архивировать
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'active' | 'archived')}>
        <TabsList className="mb-4">
          <TabsTrigger value="active" className="gap-2">
            Активные
            {transactions && transactions.length > 0 && (
              <span className="text-xs bg-primary/10 px-1.5 py-0.5 rounded">
                {transactions.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="archived" className="gap-2">
            Архив
            {archivedTransactions && archivedTransactions.length > 0 && (
              <span className="text-xs bg-muted-foreground/20 px-1.5 py-0.5 rounded">
                {archivedTransactions.length}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        {/* Filter Bar */}
        <FilterBar />

        <TabsContent value="active">
          {/* Active Transactions List */}
          <div className="mt-6 space-y-3">
            {isLoadingActive ? (
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
                    : 'У вас пока нет активных транзакций'}
                </p>
                <Button
                  variant="link"
                  onClick={() => navigate(ROUTES.ADD_TRANSACTION)}
                  className="mt-2"
                >
                  Добавить первую транзакцию
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
                  <div className="flex gap-1">
                    {transaction.id && (
                      <>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="cursor-pointer"
                          onClick={() => handleArchive(transaction.id!)}
                          disabled={archiveMutation.isPending}
                          aria-label="Архивировать"
                        >
                          <Archive className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="cursor-pointer text-destructive hover:text-destructive"
                          onClick={() => openDialog(transaction.id!)}
                          aria-label="Удалить"
                        >
                          Удалить
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </TabsContent>

        <TabsContent value="archived">
          {/* Archived Transactions List */}
          <div className="mt-6 space-y-3">
            {isLoadingArchived ? (
              <>
                {[1, 2, 3, 4, 5].map((i) => (
                  <Skeleton key={i} className="h-20 w-full" />
                ))}
              </>
            ) : filteredArchivedTransactions.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-muted-foreground">
                  {archivedTransactions && archivedTransactions.length > 0
                    ? 'Нет транзакций, соответствующих фильтрам'
                    : 'Архив пуст'}
                </p>
              </div>
            ) : (
              filteredArchivedTransactions.map((transaction) => (
                <div key={transaction.id} className="flex items-center gap-2 opacity-75">
                  <div className="flex-1">
                    <TransactionListItem
                      transaction={transaction}
                      onClick={() => {}}
                    />
                  </div>
                  {transaction.id && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="cursor-pointer gap-1"
                      onClick={() => handleUnarchive(transaction.id!)}
                      disabled={unarchiveMutation.isPending}
                      aria-label="Восстановить"
                    >
                      <ArchiveRestore className="h-4 w-4" />
                      <span className="hidden sm:inline">Восстановить</span>
                    </Button>
                  )}
                </div>
              ))
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* Floating Action Button - Add Transaction (only on active tab) */}
      {activeTab === 'active' && (
        <Button
          size="lg"
          className="fixed bottom-20 md:bottom-6 right-6 h-14 w-14 rounded-full shadow-lg md:h-auto md:w-auto md:rounded-md md:px-6"
          onClick={() => navigate(ROUTES.ADD_TRANSACTION)}
          aria-label="Добавить транзакцию"
        >
          <Plus className="h-6 w-6 md:mr-2" aria-hidden="true" />
          <span className="hidden md:inline">Добавить</span>
        </Button>
      )}

      {/* Delete Confirmation Dialog */}
      {DialogComponent}
    </div>
  );
}
