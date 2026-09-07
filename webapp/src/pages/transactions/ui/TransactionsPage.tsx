import { useMemo, useState, type ReactNode } from 'react';
import { Archive, Plus, Search, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import {
  useTransactions,
  useArchivedTransactions,
  useArchiveTransaction,
  useUnarchiveTransaction,
  useArchiveAllTransactions,
  groupTransactionsByDate,
  formatHistorySubtitle,
  type DateGroup,
} from '@/entities/transaction';
import { useUserStore } from '@/entities/user/model/store';
import { FilterBar, useTransactionFiltersStore, filterTransactions } from '@/features/filter-transactions';
import { useDeleteTransactionDialog } from '@/features/delete-transaction';
import { QuickAddSheet } from '@/features/quick-add';
import { Button, EmptyState, PageHeader, PageShell, SegmentedTabsList, SegmentedTabsTrigger } from '@/shared/ui';
import { Skeleton } from '@/shared/ui/skeleton';
import { Tabs, TabsContent } from '@/shared/ui/tabs';
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
import { ROUTES } from '@/shared/lib/constants/routes';
import { HistoryDayGroup } from './HistoryDayGroup';

function HistoryListSkeleton() {
  return (
    <div className="space-y-2" aria-hidden="true">
      {[1, 2, 3, 4, 5].map((i) => (
        <Skeleton key={i} className="h-[52px] w-full rounded-xl" />
      ))}
    </div>
  );
}

interface HistoryListProps {
  isLoading: boolean;
  groups: DateGroup[];
  /** Rows in this scope before filtering — tells an empty search from an empty history. */
  hasAnyRows: boolean;
  isFiltered: boolean;
  emptyState: ReactNode;
  showSummary?: boolean;
  dimmed?: boolean;
  onOpen?: (id: string) => void;
  onArchive?: (id: string) => void;
  onUnarchive?: (id: string) => void;
  onDelete: (id: string) => void;
}

function HistoryList({
  isLoading,
  groups,
  hasAnyRows,
  isFiltered,
  emptyState,
  showSummary,
  dimmed,
  onOpen,
  onArchive,
  onUnarchive,
  onDelete,
}: HistoryListProps) {
  if (isLoading) {
    return <HistoryListSkeleton />;
  }

  if (groups.length === 0) {
    // A filter that hides everything is a different situation from an empty history,
    // and the way out of it is different too — say which one the user is in.
    return isFiltered && hasAnyRows ? (
      <EmptyState
        icon="🔍"
        title="Ничего не найдено"
        description="Измените запрос или сбросьте фильтр"
        size="md"
      />
    ) : (
      emptyState
    );
  }

  return (
    <div className="space-y-5">
      {groups.map((group) => (
        <HistoryDayGroup
          key={group.label}
          group={group}
          showSummary={showSummary}
          dimmed={dimmed}
          onOpen={onOpen}
          onArchive={onArchive}
          onUnarchive={onUnarchive}
          onDelete={onDelete}
        />
      ))}
    </div>
  );
}

/**
 * History — the correction surface of the quick-action loop (FT-081).
 *
 * The page answers «что я записал и что из этого надо поправить», so it is built as a
 * dated log rather than a management console: days in reverse order, each with its own
 * real-expense total, and the same `CompactTransactionRow` the Home recent list uses —
 * a capture looks identical wherever the user checks it.
 *
 * The management affordances did not go anywhere, they just stopped setting the tone.
 * Search/filter live behind one press instead of occupying the space above the list
 * (and above an empty one); archive, restore and delete live in each row's menu; bulk
 * hide stays a quiet ghost button under the list.
 */
export function TransactionsPage() {
  const navigate = useNavigate();
  const userId = useUserStore((state) => state.userId);
  const [activeTab, setActiveTab] = useState<'active' | 'archived'>('active');
  const [isSearchOpen, setIsSearchOpen] = useState(false);

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
  const { searchQuery, typeFilter, categoryFilter, resetFilters } = useTransactionFiltersStore();
  const isFiltered = searchQuery !== '' || typeFilter !== 'all' || categoryFilter !== null;

  const filters = useMemo(
    () => ({ searchQuery, typeFilter, categoryFilter }),
    [searchQuery, typeFilter, categoryFilter]
  );

  const filteredTransactions = useMemo(
    () => (transactions ? filterTransactions(transactions, filters) : []),
    [transactions, filters]
  );

  const filteredArchivedTransactions = useMemo(
    () => (archivedTransactions ? filterTransactions(archivedTransactions, filters) : []),
    [archivedTransactions, filters]
  );

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

  const scopeTransactions = activeTab === 'active' ? transactions : archivedTransactions;
  const scopeShownCount =
    activeTab === 'active' ? filteredTransactions.length : filteredArchivedTransactions.length;
  const scopeTotalCount = scopeTransactions?.length ?? 0;

  const needsReviewCount = useMemo(
    () => (scopeTransactions ?? []).filter((transaction) => transaction._needsReview).length,
    [scopeTransactions]
  );

  const toggleSearch = () => {
    // Collapsing clears the filters as well: a filter left running behind a hidden bar
    // would keep trimming History with nothing on screen to explain the missing rows.
    if (isSearchOpen) resetFilters();
    setIsSearchOpen(!isSearchOpen);
  };

  return (
    <PageShell>
      <PageHeader
        title="История"
        subtitle={formatHistorySubtitle({
          scope: activeTab,
          shown: scopeShownCount,
          total: scopeTotalCount,
          needsReviewCount,
          isFiltered,
        })}
        action={
          // Nothing to search through yet — an empty history does not need the control
          // that would otherwise be the loudest thing on the screen. Once the bar is
          // open the button stays regardless: switching to an empty scope must not
          // strand the user with a search bar and no way to close it.
          scopeTotalCount > 0 || isSearchOpen ? (
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleSearch}
              // Stable QA hook, like the dock's `data-dock-center`: screenshot runs
              // must not break when the label or the icon changes.
              data-history-search-toggle
              aria-expanded={isSearchOpen}
              aria-label={isSearchOpen ? 'Закрыть поиск' : 'Искать по записям'}
              title={isSearchOpen ? 'Закрыть поиск' : 'Искать по записям'}
            >
              {isSearchOpen ? (
                <X className="h-4 w-4" aria-hidden="true" />
              ) : (
                <Search className="h-4 w-4" aria-hidden="true" />
              )}
            </Button>
          ) : undefined
        }
      />

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'active' | 'archived')}>
        <SegmentedTabsList className="grid-cols-2">
          <SegmentedTabsTrigger value="active">
            Текущие
            {transactions && transactions.length > 0 && (
              <span className="text-xs bg-primary/10 px-1.5 py-0.5 rounded">
                {transactions.length}
              </span>
            )}
          </SegmentedTabsTrigger>
          <SegmentedTabsTrigger value="archived">
            Скрытые
            {archivedTransactions && archivedTransactions.length > 0 && (
              <span className="text-xs bg-muted-foreground/20 px-1.5 py-0.5 rounded">
                {archivedTransactions.length}
              </span>
            )}
          </SegmentedTabsTrigger>
        </SegmentedTabsList>

        {/* Filter Bar — revealed on demand, so the daily list starts at the list */}
        {isSearchOpen && (
          <div className="mb-4">
            <FilterBar autoFocus />
          </div>
        )}

        <TabsContent value="active" className="mt-4">
          <HistoryList
            isLoading={isLoadingActive}
            groups={groupedTransactions}
            hasAnyRows={(transactions?.length ?? 0) > 0}
            isFiltered={isFiltered}
            // A filtered list is a search result, not a day report: «Расходы» over the
            // rows that survived a query would name the day but count only the matches,
            // and 114 000 would sit under a date whose real total is 235 000.
            showSummary={!isFiltered}
            onOpen={(id) => navigate(ROUTES.EDIT_TRANSACTION(id))}
            onArchive={handleArchive}
            onDelete={openDialog}
            emptyState={
              <EmptyState
                icon="📝"
                title="Пока ничего не записано"
                description="Записи из Telegram-бота и из Mini App появляются здесь сразу после сохранения"
                tip="Голосом — в чате бота: скажите «Обед 50 тысяч», и запись окажется тут"
                action={
                  <Button variant="outline" onClick={() => navigate(ROUTES.ADD_TRANSACTION)}>
                    Добавить вручную
                  </Button>
                }
                size="md"
                className="px-2 pt-16 pb-32 md:pb-10"
              />
            }
          />

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

        <TabsContent value="archived" className="mt-4">
          <HistoryList
            isLoading={isLoadingArchived}
            groups={groupedArchivedTransactions}
            hasAnyRows={(archivedTransactions?.length ?? 0) > 0}
            isFiltered={isFiltered}
            // Hidden rows are deliberately outside every total the app reports, so a
            // «Расходы …» line over a group of them would contradict what hiding means.
            showSummary={false}
            dimmed
            onUnarchive={handleUnarchive}
            onDelete={openDialog}
            emptyState={
              <EmptyState
                icon="📦"
                title="Здесь пока пусто"
                description="Скрытая запись остаётся в базе, но перестаёт попадать в итоги и аналитику"
                size="md"
              />
            }
          />
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
    </PageShell>
  );
}
