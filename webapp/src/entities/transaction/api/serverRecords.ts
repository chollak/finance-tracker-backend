import { apiClient } from '@/shared/api/client';
import { API_ENDPOINTS } from '@/shared/lib/constants/routes';
import type { CreateTransactionDTO, Transaction } from '@/shared/types';

/** How long writing a record may wait for the server (FT-129). */
export const RECORD_WRITE_TIMEOUT_MS = 15_000;

/** What `POST /api/transactions` answers: the record's id and the record as stored, with the category it resolved. */
interface CreatedRecordAnswer {
  id: string;
  transaction?: Partial<Omit<Transaction, 'amount'>> & { amount?: number | string };
}

/**
 * Writes a record on the server (manual entry FT-113, the quick chips FT-114). A write that gets no answer in time is
 * given up (FT-129): its screen keeps it on the device with the same client id, so the outbox sends it once the
 * connection is back. The answer's record wins over what was sent: the server resolved the category.
 */
export async function createRecord(dto: CreateTransactionDTO): Promise<Transaction> {
  const response = await apiClient.post<CreatedRecordAnswer>(
    API_ENDPOINTS.TRANSACTIONS.CREATE,
    {
      date: dto.date,
      category: dto.category,
      categoryId: dto.categoryId,
      description: dto.description,
      amount: dto.amount,
      type: dto.type,
      semanticType: dto.semanticType,
      needsReview: dto.needsReview,
      userId: dto.userId,
      merchant: dto.merchant,
      amountMinor: dto.amountMinor,
      currency: dto.currency,
      accountId: dto.accountId,
      clientId: dto.clientId,
    },
    { timeoutMs: RECORD_WRITE_TIMEOUT_MS }
  );

  if (!response.data) {
    throw new Error('Failed to create transaction on server');
  }

  const stored = { ...dto, ...response.data.transaction };
  return {
    id: response.data.id,
    date: stored.date,
    category: stored.category,
    categoryId: stored.categoryId,
    categoryColor: stored.categoryColor,
    description: stored.description,
    amount: Number(stored.amount),
    type: stored.type,
    semanticType: stored.semanticType,
    needsReview: stored.needsReview ?? false,
    userId: stored.userId,
    merchant: stored.merchant,
    createdAt: new Date().toISOString(),
    isArchived: stored.isArchived || false,
  };
}

/** Deletes a record softly on the server (FT-105); the server takes the user from authentication. */
export async function deleteRecord(id: string): Promise<void> {
  await apiClient.delete(API_ENDPOINTS.TRANSACTIONS.DELETE(id));
}

/**
 * Brings a deleted record back (the «Отменить» of «Удалено»): `POST /transactions/:id/restore` (FT-105). Throws when
 * there is nothing to bring back, so the toast says the undo failed.
 */
export async function restoreRecord(id: string): Promise<void> {
  await apiClient.post(API_ENDPOINTS.TRANSACTIONS.RESTORE(id));
}
