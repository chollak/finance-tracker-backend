import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from './client';
import type { CaptureResult, CreateTransactionInput, Transaction } from '../types/transaction';

export const transactionKeys = {
  list: (telegramId: string) => ['transactions', telegramId] as const,
};

/**
 * Список транзакций пользователя.
 *
 * В путь идёт telegramId, НЕ UUID. При UUID userResolutionMiddleware ставит
 * telegramId: null, и проверка владения на сервере пропускается целиком —
 * то есть UUID в пути это обход собственной защиты.
 *
 * Пагинации у маршрута нет: он игнорирует query и возвращает всю неархивную
 * историю одним массивом. Пока записей десятки — это дешевле пагинации.
 * Когда станут тысячи, пробросить limit в GetUserTransactionsUseCase:
 * репозиторный findByUserId(userId, limit?) его уже поддерживает.
 *
 * Побочный эффект, на который опирается порядок операций: этот запрос
 * резолвит telegramId через getOrCreateUser и тем самым СОЗДАЁТ пользователя.
 * Правка и удаление ходят через GetUserUseCase, который не создаёт, и вернут
 * 403 для пользователя, которого ещё нет.
 */
export function useTransactions(telegramId: string) {
  return useQuery({
    queryKey: transactionKeys.list(telegramId),
    queryFn: () => apiClient.get<Transaction[]>(`/transactions/user/${telegramId}`),
  });
}

/**
 * Ручное создание. Уходит в POST /api/transactions — это ВТОРОЙ путь создания
 * рядом с разбором строки, и он оплачен сознательно (см. спеку, «Цена решения»).
 *
 * Оба пути обязаны сходиться в CreateTransactionUseCase: там стоит нормализация
 * даты и семантического типа. Писать в репозиторий мимо него нельзя — расхождение
 * двух путей в этом проекте уже было багом.
 *
 * В userId идёт telegramId. Сервер его всё равно перезапишет личностью из
 * initData, но слать чужой идентификатор бессмысленно и сбивает с толку.
 */
export function useCreateTransaction(telegramId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: Omit<CreateTransactionInput, 'userId'>) =>
      apiClient.post<{ id: string; transaction: Transaction }>('/transactions', {
        ...input,
        userId: telegramId,
        // Иначе запись из формы неотличима от ботовой, и поле source
        // не выполняет того, ради чего заведено.
        source: 'webapp',
      }),
    // Ответ — эхо запроса, а не строка из БД: в нём нет createdAt, isArchived
    // и isDebtRelated. Поэтому список перезапрашивается, а не правится вручную.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: transactionKeys.list(telegramId) }),
  });
}

/**
 * Быстрый путь: одна строка естественным языком уходит в разбор.
 *
 * ЧАСТИЧНЫЙ УСПЕХ ПО КОНСТРУКЦИИ. HTTP 200 не означает, что транзакция создана:
 * упавшая при создании молча не попадает в массив. Считать созданным только то,
 * что пришло в transactions.
 */
export function useCaptureText(telegramId: string, userName: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (text: string) =>
      apiClient.post<CaptureResult>('/voice/text-input', {
        text,
        userId: telegramId,
        userName,
        source: 'webapp',
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: transactionKeys.list(telegramId) }),
  });
}
