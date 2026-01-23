/**
 * Local Transaction Repository
 * CRUD operations for transactions stored in IndexedDB
 * Used for guest users only (offline-first)
 */

import { db } from './indexedDB';
import type {
  LocalTransaction,
  CreateLocalTransactionDTO,
  UpdateLocalTransactionDTO,
} from './schema';

/**
 * Generate a UUID v4
 */
function generateUUID(): string {
  return crypto.randomUUID();
}

/**
 * Local Transaction Repository
 * Provides offline-first CRUD operations for guest users
 */
export const localTransactionRepo = {
  /**
   * Create a new local transaction
   */
  async create(dto: CreateLocalTransactionDTO): Promise<LocalTransaction> {
    const now = Date.now();
    const transaction: LocalTransaction = {
      id: generateUUID(),
      ...dto,
      localCreatedAt: now,
      localUpdatedAt: now,
      isArchived: false,
    };

    await db.transactions.add(transaction);
    console.log('[LocalRepo] Transaction created:', transaction.id);
    return transaction;
  },

  /**
   * Get all transactions for a user (non-archived)
   */
  async getByUserId(userId: string): Promise<LocalTransaction[]> {
    const transactions = await db.transactions
      .where('userId')
      .equals(userId)
      .filter((tx) => !tx.isArchived)
      .toArray();

    // Sort by date descending
    return transactions.sort((a, b) => b.date.localeCompare(a.date));
  },

  /**
   * Get all transactions for a user (including archived)
   */
  async getAllByUserId(userId: string): Promise<LocalTransaction[]> {
    return db.transactions.where('userId').equals(userId).reverse().sortBy('date');
  },

  /**
   * Get a transaction by ID
   */
  async getById(id: string): Promise<LocalTransaction | undefined> {
    return db.transactions.get(id);
  },

  /**
   * Update a transaction
   */
  async update(
    id: string,
    updates: UpdateLocalTransactionDTO
  ): Promise<LocalTransaction | undefined> {
    const existing = await db.transactions.get(id);
    if (!existing) {
      console.warn('[LocalRepo] Transaction not found:', id);
      return undefined;
    }

    const updatedTransaction: LocalTransaction = {
      ...existing,
      ...updates,
      localUpdatedAt: Date.now(),
    };

    await db.transactions.put(updatedTransaction);
    console.log('[LocalRepo] Transaction updated:', id);
    return updatedTransaction;
  },

  /**
   * Delete a transaction
   */
  async delete(id: string): Promise<boolean> {
    const existing = await db.transactions.get(id);
    if (!existing) {
      return false;
    }

    await db.transactions.delete(id);
    console.log('[LocalRepo] Transaction deleted:', id);
    return true;
  },

  /**
   * Archive a transaction
   */
  async archive(id: string): Promise<boolean> {
    const count = await db.transactions.update(id, {
      isArchived: true,
      localUpdatedAt: Date.now(),
    });
    return count > 0;
  },

  /**
   * Get transactions in date range
   */
  async getByDateRange(
    userId: string,
    startDate: string,
    endDate: string
  ): Promise<LocalTransaction[]> {
    return db.transactions
      .where('userId')
      .equals(userId)
      .and((tx) => tx.date >= startDate && tx.date <= endDate && !tx.isArchived)
      .toArray();
  },

  /**
   * Calculate analytics summary locally
   */
  async getAnalyticsSummary(
    userId: string,
    startDate?: string,
    endDate?: string
  ): Promise<{
    totalIncome: number;
    totalExpense: number;
    balance: number;
    transactionCount: number;
  }> {
    const query = db.transactions.where('userId').equals(userId);

    const transactions = await query
      .and((tx) => {
        if (tx.isArchived) return false;
        if (startDate && tx.date < startDate) return false;
        if (endDate && tx.date > endDate) return false;
        return true;
      })
      .toArray();

    const totalIncome = transactions
      .filter((tx) => tx.type === 'income')
      .reduce((sum, tx) => sum + tx.amount, 0);

    const totalExpense = transactions
      .filter((tx) => tx.type === 'expense')
      .reduce((sum, tx) => sum + tx.amount, 0);

    return {
      totalIncome,
      totalExpense,
      balance: totalIncome - totalExpense,
      transactionCount: transactions.length,
    };
  },

  /**
   * Get spending by category
   */
  async getByCategory(
    userId: string,
    startDate?: string,
    endDate?: string
  ): Promise<Record<string, number>> {
    const transactions = await db.transactions
      .where('userId')
      .equals(userId)
      .and((tx) => {
        if (tx.isArchived) return false;
        if (tx.type !== 'expense') return false;
        if (startDate && tx.date < startDate) return false;
        if (endDate && tx.date > endDate) return false;
        return true;
      })
      .toArray();

    return transactions.reduce(
      (acc, tx) => {
        acc[tx.category] = (acc[tx.category] || 0) + tx.amount;
        return acc;
      },
      {} as Record<string, number>
    );
  },

  /**
   * Get transaction count by user
   */
  async getCount(userId: string): Promise<number> {
    return db.transactions.where('userId').equals(userId).count();
  },

  /**
   * Clear all transactions for a user
   * Used when switching from guest to Telegram mode
   */
  async clearForUser(userId: string): Promise<number> {
    const transactions = await db.transactions.where('userId').equals(userId).toArray();
    const ids = transactions.map((tx) => tx.id);
    await db.transactions.bulkDelete(ids);
    console.log('[LocalRepo] Cleared', ids.length, 'transactions for user:', userId);
    return ids.length;
  },
};

export default localTransactionRepo;
