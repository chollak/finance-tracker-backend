import { useState, useEffect, useCallback } from 'react';
import { openaiUsageApi, UsageSummary, UsageAlert, CreditBalance } from '../services/openaiUsageApi';

export interface UseOpenAIUsageReturn {
  usage: UsageSummary | null;
  alerts: UsageAlert[];
  creditBalance: CreditBalance | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  lastUpdated: Date | null;
}

export function useOpenAIUsage(autoRefresh: boolean = true): UseOpenAIUsageReturn {
  const [usage, setUsage] = useState<UsageSummary | null>(null);
  const [alerts, setAlerts] = useState<UsageAlert[]>([]);
  const [creditBalance, setCreditBalance] = useState<CreditBalance | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchUsage = useCallback(async (forceRefresh: boolean = false) => {
    try {
      setLoading(true);
      setError(null);

      const response = forceRefresh 
        ? await openaiUsageApi.refreshUsage()
        : await openaiUsageApi.getUsageSummary();

      if (response.success) {
        const summaryData = 'summary' in response.data ? response.data.summary : response.data;
        const alertsData = 'alerts' in response.data ? response.data.alerts : [];
        const creditBalanceData = 'creditBalance' in response.data ? response.data.creditBalance : null;
        
        setUsage(summaryData);
        setAlerts(alertsData);
        setCreditBalance(creditBalanceData);
        setLastUpdated(new Date());
      } else {
        setError('Failed to fetch usage data');
      }
    } catch (err) {
      console.error('Error fetching OpenAI usage:', err);
      setError(err instanceof Error ? err.message : 'Unknown error occurred');
    } finally {
      setLoading(false);
    }
  }, []);

  const refresh = useCallback(async () => {
    await fetchUsage(true);
  }, [fetchUsage]);

  useEffect(() => {
    fetchUsage(false);
  }, [fetchUsage]);

  // Auto-refresh every 5 minutes if enabled
  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(() => {
      fetchUsage(false);
    }, 5 * 60 * 1000); // 5 minutes

    return () => clearInterval(interval);
  }, [autoRefresh, fetchUsage]);

  return {
    usage,
    alerts,
    creditBalance,
    loading,
    error,
    refresh,
    lastUpdated
  };
}