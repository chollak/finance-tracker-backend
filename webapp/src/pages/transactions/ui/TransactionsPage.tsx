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
import { useUserStore } from '@/entities/user/model/store';
import { FilterBar, useTransactionFiltersStore, filterTransactions } from '@/features/filter-transactions';
import { useDeleteTransactionDialog } from '@/features/delete-transaction';
import { QuickAddSheet } from '@/features/quick-add';
import { Button, EmptyState } from '@/shared/ui';
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
    if (!userId) return;
    try {
      await archiveMutation.mutateAsync({ id, userId });
      toast.success('Транзакция скрыта');
    } catch {
      toast.error('Не удалось скрыть транзакцию');
    }
  };

  const handleUnarchive = async (id: string) => {
    if (!userId) return;
    try {
      await unarchiveMutation.mutateAsync({ id, userId });
      toast.success('Транзакция восстановлена');
    } catch {
      toast.error('Не удалось восстановить транзакцию');
    }
  };

  const handleArchiveAll = async () => {
    if (!userId) return;
    try {
      const result = await archiveAllMutation.mutateAsync(userId);
      toast.success(`Скрыто транзакций: ${result.archivedCount}`);
    } catch {
      toast.error('Не удалось скрыть транзакции');
    }
  };

  const currentTransactions = activeTab === 'active' ? filteredTransactions : filteredArchivedTransactions;
  const totalCount = activeTab === 'active' ? (transactions?.length || 0) : (archivedTransactions?.length || 0);

  return (
    <div className="container mx-auto px-4 py-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight">Транзакции</h1>
        <p className="text-muted-foreground mt-1" role="status" aria-live="polite">
          {currentTransactions.length} из {totalCount}{' '}
          {activeTab === 'active' ? 'текущих' : 'скрытых'}
        </p>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'active' | 'archived')}>
        <TabsList className="mb-4 grid h-12 w-full grid-cols-2 rounded-2xl p-1">
          <TabsTrigger value="active" className="gap-2 rounded-xl py-2">
            Текущие
            {transactions && transactions.length > 0 && (
              <span className="text-xs bg-primary/10 px-1.5 py-0.5 rounded">
                {transactions.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="archived" className="gap-2 rounded-xl py-2">
            Скрытые
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
              transactions && transactions.length > 0 ? (
                <EmptyState
                  icon="🔍"
                  title="Ничего не найдено"
                  description="Попробуйте изменить параметры поиска или сбросить фильтры"
                  size="md"
                />
              ) : (
                <EmptyState
                  icon="📝"
                  title="Нет транзакций"
                  description="Начните записывать свои расходы и доходы, чтобы видеть полную картину финансов"
                  tip="Попробуйте голосовой ввод — просто скажите 'Обед 50 тысяч' в Telegram боте!"
                  action={
                    <Button onClick={() => navigate(ROUTES.ADD_TRANSACTION)}>
                      Добавить первую транзакцию
                    </Button>
                  }
                  size="md"
                  className="px-2 pt-16 pb-32 md:pb-10"
                />
              )
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

          {/* Bulk hide action - intentionally quiet, not a primary header action */}
          {transactions && transactions.length > 0 && (
            <div className="mt-8 flex justify-center">
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground">
                    <Archive className="h-3.5 w-3.5" />
                    Скрыть все текущие
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Скрыть все текущие транзакции?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Они переместятся во вкладку «Скрытые» и перестанут учитываться в текущих итогах и аналитике.
                      Ничего не удаляется — вы сможете вернуть их обратно в любой момент.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Отмена</AlertDialogCancel>
                    <AlertDialogAction onClick={handleArchiveAll}>
                      Скрыть все
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          )}
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
              archivedTransactions && archivedTransactions.length > 0 ? (
                <EmptyState
                  icon="🔍"
                  title="Ничего не найдено"
                  description="Попробуйте изменить параметры поиска или сбросить фильтры"
                  size="md"
                />
              ) : (
                <EmptyState
                  icon="📦"
                  title="Здесь пока пусто"
                  description="Транзакции, которые вы скроете, окажутся тут"
                  tip="Скрывайте старые транзакции, чтобы они не учитывались в текущих итогах"
                  size="md"
                />
              )
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

      {/* Add Transaction - desktop only; mobile uses the central bottom-nav action */}
      {activeTab === 'active' && transactions && transactions.length > 0 && (
        <QuickAddSheet>
          <Button
            size="lg"
            className="hidden md:fixed md:bottom-6 md:right-6 md:flex h-14 w-14 rounded-full shadow-lg md:h-auto md:w-auto md:rounded-md md:px-6"
            aria-label="Добавить транзакцию"
          >
            <Plus className="h-6 w-6 md:mr-2" aria-hidden="true" />
            <span className="hidden md:inline">Добавить</span>
          </Button>
        </QuickAddSheet>
      )}

      {/* Delete Confirmation Dialog */}
      {DialogComponent}
    </div>
  );
}
