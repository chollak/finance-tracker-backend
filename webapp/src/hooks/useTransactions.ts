import { useState, useEffect } from 'react';
import { Transaction } from '../types';

export const useTransactions = (userId: string | null) => {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) {
      setLoading(false);
      return;
    }

    const fetchTransactions = async () => {
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
    };

    fetchTransactions();
  }, [userId]);

  return { transactions, loading, error, refetch: () => setLoading(true) };
};