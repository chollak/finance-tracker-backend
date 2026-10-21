import { useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { analyticsKeys } from '@/entities/analytics';
import { createCategory, deleteCategory, updateCategory, type Category, type CategoryPatch, type NewCategory } from '@/entities/category';
import { transactionKeys } from '@/entities/transaction';
import { useUserStore } from '@/entities/user';
import type { ApiError } from '@/shared/api';
import { showUndoToast } from '@/shared/lib/undo';
import { keptAddedToast, writeFailedToast, type CategoryWrite } from '../model/categoriesScreen';

/**
 * The categories screen's writes (FT-127). After each, what shows a category's name — analytics rows, records of
 * History and Home — is read again; the categories list itself is kept by the entity.
 */
export function useCategoryWrites() {
  const queryClient = useQueryClient();
  const userId = useUserStore((state) => state.userId) ?? '';

  return useMemo(() => {
    const refreshReaders = () => {
      void queryClient.invalidateQueries({ queryKey: analyticsKeys.all(userId) });
      void queryClient.invalidateQueries({ queryKey: transactionKeys.list(userId) });
    };
    const update = async (id: string, patch: CategoryPatch) => {
      const category = await updateCategory(queryClient, userId, id, patch);
      refreshReaders();
      return category;
    };

    return {
      /**
       * A change with its toast and «Отменить», which writes it back. A write the server refuses or that does not get
       * through is said in a toast too: the sheet that asked for it has closed.
       */
      apply: async (id: string, write: CategoryWrite, name: string): Promise<void> => {
        try {
          await update(id, write.patch);
        } catch (error) {
          showUndoToast({ kind: 'info', ...writeFailedToast(error as Partial<ApiError>, name) });
          return;
        }
        showUndoToast({ kind: 'changed', ...write.toast, undo: () => update(id, write.undo).then(() => undefined) });
      },
      /** «Добавить категорию расхода». */
      add: (category: NewCategory) => createCategory(queryClient, userId, category),
      /**
       * «Отменить» after «Категория добавлена»: deletes it while nothing went in it. Once a record has (409) it stays,
       * the month is read again so its row counts that record, and the toast says why: a retry could never succeed.
       * Any other failure is thrown, so the toast offers «Отменить» again.
       */
      takeBack: async (category: Category): Promise<void> => {
        try {
          await deleteCategory(queryClient, userId, category.id);
        } catch (error) {
          if ((error as Partial<ApiError> | undefined)?.statusCode !== 409) throw error;
          refreshReaders();
          showUndoToast({ kind: 'info', ...keptAddedToast(category.name) });
        }
      },
    };
  }, [queryClient, userId]);
}
