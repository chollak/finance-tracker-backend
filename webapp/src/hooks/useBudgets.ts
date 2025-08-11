import { useState, useEffect, useCallback } from 'react';
import { Budget, BudgetSummary, BudgetPeriod } from '../types';
import { budgetApi } from '../services/api';

export const useBudgets = (userId: string | null) => {
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [budgetSummaries, setBudgetSummaries] = useState<BudgetSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch budgets
  const fetchBudgets = useCallback(async (activeOnly = false) => {
    if (!userId) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const response = await budgetApi.getBudgets(userId, activeOnly);
      if (response.success && response.data) {
        setBudgets(response.data);
      } else {
        setError('Failed to fetch budgets');
      }
    } catch (err) {
      setError('Error fetching budgets');
      console.error('Error fetching budgets:', err);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  // Fetch budget summaries
  const fetchBudgetSummaries = useCallback(async () => {
    if (!userId) return;
    
    try {
      const response = await budgetApi.getBudgetSummaries(userId);
      if (response.success && response.data) {
        setBudgetSummaries(response.data);
      }
    } catch (err) {
      console.error('Error fetching budget summaries:', err);
    }
  }, [userId]);

  // Create budget
  const createBudget = useCallback(async (budgetData: {
    name: string;
    amount: number;
    period: BudgetPeriod;
    startDate: string;
    endDate: string;
    categoryIds?: string[];
    description?: string;
  }) => {
    if (!userId) return null;
    
    setLoading(true);
    setError(null);
    
    try {
      const response = await budgetApi.createBudget(userId, budgetData);
      if (response.success && response.data) {
        await fetchBudgets(); // Refresh the list
        await fetchBudgetSummaries();
        return response.data;
      } else {
        setError('Failed to create budget');
        return null;
      }
    } catch (err) {
      setError('Error creating budget');
      console.error('Error creating budget:', err);
      return null;
    } finally {
      setLoading(false);
    }
  }, [userId, fetchBudgets, fetchBudgetSummaries]);

  // Update budget
  const updateBudget = useCallback(async (budgetId: string, updates: Partial<Budget>) => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await budgetApi.updateBudget(budgetId, updates);
      if (response.success && response.data) {
        await fetchBudgets(); // Refresh the list
        await fetchBudgetSummaries();
        return response.data;
      } else {
        setError('Failed to update budget');
        return null;
      }
    } catch (err) {
      setError('Error updating budget');
      console.error('Error updating budget:', err);
      return null;
    } finally {
      setLoading(false);
    }
  }, [fetchBudgets, fetchBudgetSummaries]);

  // Delete budget
  const deleteBudget = useCallback(async (budgetId: string) => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await budgetApi.deleteBudget(budgetId);
      if (response.success) {
        await fetchBudgets(); // Refresh the list
        await fetchBudgetSummaries();
        return true;
      } else {
        setError('Failed to delete budget');
        return false;
      }
    } catch (err) {
      setError('Error deleting budget');
      console.error('Error deleting budget:', err);
      return false;
    } finally {
      setLoading(false);
    }
  }, [fetchBudgets, fetchBudgetSummaries]);

  // Get budget alerts
  const getBudgetAlerts = useCallback(async (threshold?: number) => {
    if (!userId) return null;
    
    try {
      const response = await budgetApi.getBudgetAlerts(userId, threshold);
      if (response.success && response.data) {
        return response.data;
      }
      return null;
    } catch (err) {
      console.error('Error fetching budget alerts:', err);
      return null;
    }
  }, [userId]);

  // Recalculate budget
  const recalculateBudget = useCallback(async (budgetId: string) => {
    try {
      const response = await budgetApi.recalculateBudget(budgetId);
      if (response.success) {
        await fetchBudgetSummaries(); // Refresh summaries
        return true;
      }
      return false;
    } catch (err) {
      console.error('Error recalculating budget:', err);
      return false;
    }
  }, [fetchBudgetSummaries]);

  // Load initial data
  useEffect(() => {
    if (userId) {
      fetchBudgets();
      fetchBudgetSummaries();
    }
  }, [userId, fetchBudgets, fetchBudgetSummaries]);

  return {
    budgets,
    budgetSummaries,
    loading,
    error,
    fetchBudgets,
    fetchBudgetSummaries,
    createBudget,
    updateBudget,
    deleteBudget,
    getBudgetAlerts,
    recalculateBudget
  };
};