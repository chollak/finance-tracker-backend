import { useState, useEffect, useCallback } from 'react';
import { DashboardInsights, Alert, FinancialHealthScore } from '../types';
import { dashboardApi, analyticsApi, apiUtils } from '../services/api';

export const useDashboard = (userId: string) => {
  const [dashboard, setDashboard] = useState<any>(null);
  const [insights, setInsights] = useState<DashboardInsights | null>(null);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [alertSummary, setAlertSummary] = useState<any>(null);
  const [healthScore, setHealthScore] = useState<FinancialHealthScore | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch complete dashboard data
  const fetchCompleteDashboard = useCallback(async (startDate?: string, endDate?: string) => {
    if (!userId) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const response = await dashboardApi.getCompleteDashboard(userId, startDate, endDate);
      if (response.success && response.data) {
        setDashboard(response.data);
        setInsights(response.data.insights);
        setAlerts(response.data.alerts.active);
        setAlertSummary(response.data.alerts.summary);
        setHealthScore(response.data.healthScore);
      } else {
        setError('Failed to fetch dashboard data');
      }
    } catch (err) {
      setError('Error fetching dashboard data');
      console.error('Error fetching dashboard:', err);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  // Fetch dashboard insights only
  const fetchInsights = useCallback(async (startDate?: string, endDate?: string) => {
    if (!userId) return;
    
    try {
      const response = await dashboardApi.getDashboardInsights(userId, startDate, endDate);
      if (response.success && response.data) {
        setInsights(response.data);
      }
    } catch (err) {
      console.error('Error fetching insights:', err);
    }
  }, [userId]);

  // Fetch financial health score
  const fetchHealthScore = useCallback(async () => {
    if (!userId) return;
    
    try {
      const response = await dashboardApi.getFinancialHealthScore(userId);
      if (response.success && response.data) {
        setHealthScore(response.data);
      }
    } catch (err) {
      console.error('Error fetching health score:', err);
    }
  }, [userId]);

  // Fetch alerts
  const fetchAlerts = useCallback(async (type?: string, severity?: string) => {
    if (!userId) return;
    
    try {
      const response = await dashboardApi.getAlerts(userId, type, severity);
      if (response.success && response.data) {
        setAlerts(response.data);
      }
    } catch (err) {
      console.error('Error fetching alerts:', err);
    }
  }, [userId]);

  // Fetch alert summary
  const fetchAlertSummary = useCallback(async () => {
    if (!userId) return;
    
    try {
      const response = await dashboardApi.getAlertSummary(userId);
      if (response.success && response.data) {
        setAlertSummary(response.data);
      }
    } catch (err) {
      console.error('Error fetching alert summary:', err);
    }
  }, [userId]);

  // Get quick stats
  const getQuickStats = useCallback(async () => {
    if (!userId) return null;
    
    try {
      const response = await dashboardApi.getQuickStats(userId);
      if (response.success && response.data) {
        return response.data;
      }
      return null;
    } catch (err) {
      console.error('Error fetching quick stats:', err);
      return null;
    }
  }, [userId]);

  // Refresh all dashboard data
  const refreshDashboard = useCallback(() => {
    fetchCompleteDashboard();
  }, [fetchCompleteDashboard]);

  // Load initial data
  useEffect(() => {
    if (userId) {
      fetchCompleteDashboard();
    }
  }, [userId, fetchCompleteDashboard]);

  return {
    dashboard,
    insights,
    alerts,
    alertSummary,
    healthScore,
    loading,
    error,
    fetchCompleteDashboard,
    fetchInsights,
    fetchHealthScore,
    fetchAlerts,
    fetchAlertSummary,
    getQuickStats,
    refreshDashboard
  };
};

// Enhanced analytics hook
export const useAnalytics = (userId: string) => {
  const [analytics, setAnalytics] = useState<any>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch analytics summary
  const fetchAnalyticsSummary = useCallback(async (startDate?: string, endDate?: string) => {
    if (!userId) return null;
    
    try {
      const response = await analyticsApi.getAnalyticsSummary(userId, startDate, endDate);
      if (response.success && response.data) {
        setAnalytics(prev => ({ ...prev, summary: response.data }));
        return response.data;
      }
      return null;
    } catch (err) {
      console.error('Error fetching analytics summary:', err);
      return null;
    }
  }, [userId]);

  // Fetch category breakdown
  const fetchCategoryBreakdown = useCallback(async (startDate?: string, endDate?: string) => {
    if (!userId) return null;
    
    try {
      const response = await analyticsApi.getCategoryBreakdown(userId, startDate, endDate);
      if (response.success && response.data) {
        setAnalytics(prev => ({ ...prev, categories: response.data }));
        return response.data;
      }
      return null;
    } catch (err) {
      console.error('Error fetching category breakdown:', err);
      return null;
    }
  }, [userId]);

  // Fetch monthly trends
  const fetchMonthlyTrends = useCallback(async (months = 12) => {
    if (!userId) return null;
    
    try {
      const response = await analyticsApi.getMonthlyTrends(userId, months);
      if (response.success && response.data) {
        setAnalytics(prev => ({ ...prev, trends: response.data }));
        return response.data;
      }
      return null;
    } catch (err) {
      console.error('Error fetching monthly trends:', err);
      return null;
    }
  }, [userId]);

  // Fetch spending patterns
  const fetchSpendingPatterns = useCallback(async (startDate?: string, endDate?: string) => {
    if (!userId) return null;
    
    try {
      const response = await analyticsApi.getSpendingPatterns(userId, startDate, endDate);
      if (response.success && response.data) {
        setAnalytics(prev => ({ ...prev, patterns: response.data }));
        return response.data;
      }
      return null;
    } catch (err) {
      console.error('Error fetching spending patterns:', err);
      return null;
    }
  }, [userId]);

  // Fetch top categories
  const fetchTopCategories = useCallback(async (limit = 5, startDate?: string, endDate?: string) => {
    if (!userId) return null;
    
    try {
      const response = await analyticsApi.getTopCategories(userId, limit, startDate, endDate);
      if (response.success && response.data) {
        setAnalytics(prev => ({ ...prev, topCategories: response.data }));
        return response.data;
      }
      return null;
    } catch (err) {
      console.error('Error fetching top categories:', err);
      return null;
    }
  }, [userId]);

  // Fetch all analytics data
  const fetchAllAnalytics = useCallback(async (startDate?: string, endDate?: string) => {
    if (!userId) return;
    
    setLoading(true);
    setError(null);
    
    try {
      await Promise.all([
        fetchAnalyticsSummary(startDate, endDate),
        fetchCategoryBreakdown(startDate, endDate),
        fetchMonthlyTrends(),
        fetchSpendingPatterns(startDate, endDate),
        fetchTopCategories(5, startDate, endDate)
      ]);
    } catch (err) {
      setError('Error fetching analytics data');
      console.error('Error fetching analytics:', err);
    } finally {
      setLoading(false);
    }
  }, [userId, fetchAnalyticsSummary, fetchCategoryBreakdown, fetchMonthlyTrends, fetchSpendingPatterns, fetchTopCategories]);

  return {
    analytics,
    loading,
    error,
    fetchAnalyticsSummary,
    fetchCategoryBreakdown,
    fetchMonthlyTrends,
    fetchSpendingPatterns,
    fetchTopCategories,
    fetchAllAnalytics
  };
};