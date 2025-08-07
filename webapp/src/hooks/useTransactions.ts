import { useState, useEffect, useCallback } from 'react';
import { Transaction } from '../types';

export const useTransactions = (userId: string | null) => {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTransactions = useCallback(async () => {
    if (!userId) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const response = await fetch(`/api/transactions/user/${userId}`);
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error?.message || 'Failed to fetch transactions');
      }
      
      const result = await response.json();
      // Handle new response format with success/data wrapper
      const transactions = result.success ? result.data : result;
      setTransactions(Array.isArray(transactions) ? transactions : []);
    } catch (err) {
      console.error('Failed to fetch transactions', err);
      setError(err instanceof Error ? err.message : 'Unknown error occurred');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchTransactions();
  }, [fetchTransactions]);

  const deleteTransaction = useCallback(async (transactionId: string) => {
    try {
      const response = await fetch(`/api/transactions/${transactionId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error?.message || 'Failed to delete transaction');
      }

      // Remove the transaction from local state
      setTransactions(prev => prev.filter(tx => tx.id !== transactionId));
      return true;
    } catch (err) {
      console.error('Failed to delete transaction', err);
      setError(err instanceof Error ? err.message : 'Failed to delete transaction');
      return false;
    }
  }, []);

  const updateTransaction = useCallback(async (transactionId: string, updates: Partial<Transaction>) => {
    try {
      // Find the original transaction to get learning context
      const originalTransaction = transactions.find(tx => tx.id === transactionId);
      
      // Prepare request body with learning context if available
      const requestBody: any = { ...updates };
      if (originalTransaction?.originalText && originalTransaction?.originalParsing && userId) {
        requestBody.userId = userId;
        requestBody.originalText = originalTransaction.originalText;
        requestBody.originalParsing = originalTransaction.originalParsing;
      }
      
      const response = await fetch(`/api/transactions/${transactionId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error?.message || 'Failed to update transaction');
      }

      const result = await response.json();
      const updatedTransaction = result.success ? result.data : result;
      
      // Update the transaction in local state
      setTransactions(prev => 
        prev.map(tx => tx.id === transactionId ? { ...tx, ...updatedTransaction } : tx)
      );
      return true;
    } catch (err) {
      console.error('Failed to update transaction', err);
      setError(err instanceof Error ? err.message : 'Failed to update transaction');
      return false;
    }
  }, [transactions, userId]);

  return { 
    transactions, 
    loading, 
    error, 
    refetch: fetchTransactions,
    deleteTransaction,
    updateTransaction,
    clearError: () => setError(null)
  };
};