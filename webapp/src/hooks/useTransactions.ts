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
        throw new Error('Failed to fetch transactions');
      }
      
      const data = await response.json();
      setTransactions(data);
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
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to delete transaction');
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
      const response = await fetch(`/api/transactions/${transactionId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updates),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to update transaction');
      }

      const updatedTransaction = await response.json();
      
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
  }, []);

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