import type { QueryClient } from '@tanstack/react-query';
import { apiClient } from '@/shared/api';
import { API_ENDPOINTS } from '@/shared/lib/constants';
import type { Category, CategoryPatch, NewCategory } from '../model/types';
import { categoryKeys } from './queries';

/**
 * Writes of the categories screen (FT-127). Not hooks: a sheet runs them and «Отменить» in a toast runs their reverse.
 * A change shows in the list at once and the list is read again after it; a failed change is taken back.
 */
function refetchCategories(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: categoryKeys.all });
}

/** A new category of the user; the server puts it before «Другое» and refuses a name the type already has (409). */
export async function createCategory(queryClient: QueryClient, userId: string, category: NewCategory): Promise<Category> {
  const response = await apiClient.post<Category>(API_ENDPOINTS.CATEGORIES.CREATE, category);
  queryClient.setQueryData<Category[]>(categoryKeys.list(userId), (list) => (list ? [...list, response.data] : list));
  refetchCategories(queryClient);
  return response.data;
}

/**
 * Rename, recolour, hide or show. The list shows the change before the server answers — the edit is applied as the
 * sheet closes — and gets it back if the write fails.
 */
export async function updateCategory(queryClient: QueryClient, userId: string, id: string, patch: CategoryPatch): Promise<Category> {
  const key = categoryKeys.list(userId);
  const before = queryClient.getQueryData<Category[]>(key)?.find((category) => category.id === id);
  const put = (value: (category: Category) => Category) =>
    queryClient.setQueryData<Category[]>(key, (list) => list?.map((category) => (category.id === id ? value(category) : category)));

  await queryClient.cancelQueries({ queryKey: key });
  put((category) => ({ ...category, ...patch }));
  try {
    const response = await apiClient.patch<Category>(API_ENDPOINTS.CATEGORIES.UPDATE(id), patch);
    put(() => response.data);
    return response.data;
  } catch (error) {
    if (before) put(() => before);
    throw error;
  } finally {
    refetchCategories(queryClient);
  }
}

/** «Отменить» after «Категория добавлена»: the server deletes only a category no record went into (409 otherwise). */
export async function deleteCategory(queryClient: QueryClient, userId: string, id: string): Promise<void> {
  await apiClient.delete<{ id: string }>(API_ENDPOINTS.CATEGORIES.DELETE(id));
  queryClient.setQueryData<Category[]>(categoryKeys.list(userId), (list) => list?.filter((category) => category.id !== id));
  refetchCategories(queryClient);
}
