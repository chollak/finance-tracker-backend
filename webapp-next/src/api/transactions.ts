import { useQuery } from '@tanstack/react-query';
import { apiClient } from './client';
import type { Transaction } from '../types/transaction';

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
