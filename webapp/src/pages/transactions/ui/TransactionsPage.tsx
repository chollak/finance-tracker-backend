import { useState, useMemo } from 'react';
import {
  useTransactions,
  useArchivedTransactions,
  useArchiveTransaction,
  useUnarchiveTransaction,
  useArchiveAllTransactions,
  TransactionListItem,
  groupTransactionsByDate,
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
import { Plus, Archive } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { ROUTES } from '@/shared/lib/constants/routes';
import { toast } from 'sonner';

/**
 * Transactions Page
 * Shows list of all transactions grouped by date with filtering and archive capabilities
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

  // Group transactions by date
  const groupedTransactions = useMemo(
    () => groupTransactionsByDate(filteredTransactions),
    [filteredTransactions]
  );

  const groupedArchivedTransactions = useMemo(
    () => groupTransactionsByDate(filteredArchivedTransactions),
    [filteredArchivedTransactions]
  );

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
  const currentGroups = activeTab === 'active' ? groupedTransactions : groupedArchivedTransactions;

  return (
    <div className="container mx-auto px-4 sm:px-6 py-6">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold">Транзакции</h1>
          <p className="text-muted-foreground mt-1 text-sm" role="status" aria-live="polite">
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
          {/* Active Transactions List - Grouped by Date */}
          <div className="mt-6 space-y-6">
            {isLoadingActive ? (
              <div className="space-y-3">
                {[1, 2, 3, 4, 5].map((i) => (
                  <Skeleton key={i} className="h-16 w-full rounded-lg" />
                ))}
              </div>
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
              groupedTransactions.map((group) => (
                <section key={group.label}>
                  {/* Date Header */}
                  <h3 className="sticky top-0 z-10 bg-background py-2 text-sm font-medium text-muted-foreground border-b mb-2">
                    {group.label}
                  </h3>

                  {/* Transactions in Group */}
                  <div className="space-y-1">
                    {group.transactions.map((transaction) => (
                      <TransactionListItem
                        key={transaction.id}
                        transaction={transaction}
                        onClick={() => transaction.id && navigate(ROUTES.EDIT_TRANSACTION(transaction.id))}
                        onArchive={transaction.id ? () => handleArchive(transaction.id!) : undefined}
                        onDelete={transaction.id ? () => openDialog(transaction.id!) : undefined}
                      />
                    ))}
                  </div>
                </section>
              ))
            )}
          </div>
        </TabsContent>

        <TabsContent value="archived">
          {/* Archived Transactions List - Grouped by Date */}
          <div className="mt-6 space-y-6">
            {isLoadingArchived ? (
              <div className="space-y-3">
                {[1, 2, 3, 4, 5].map((i) => (
                  <Skeleton key={i} className="h-16 w-full rounded-lg" />
                ))}
              </div>
            ) : filteredArchivedTransactions.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-muted-foreground">
                  {archivedTransactions && archivedTransactions.length > 0
                    ? 'Нет транзакций, соответствующих фильтрам'
                    : 'Архив пуст'}
                </p>
              </div>
            ) : (
              groupedArchivedTransactions.map((group) => (
                <section key={group.label} className="opacity-75">
                  {/* Date Header */}
                  <h3 className="sticky top-0 z-10 bg-background py-2 text-sm font-medium text-muted-foreground border-b mb-2">
                    {group.label}
                  </h3>

                  {/* Transactions in Group */}
                  <div className="space-y-1">
                    {group.transactions.map((transaction) => (
                      <TransactionListItem
                        key={transaction.id}
                        transaction={transaction}
                        onUnarchive={transaction.id ? () => handleUnarchive(transaction.id!) : undefined}
                        onDelete={transaction.id ? () => openDialog(transaction.id!) : undefined}
                      />
                    ))}
                  </div>
                </section>
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
