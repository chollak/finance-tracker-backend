import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { openaiUsageApi, UsageSummary, UsageAlert, CreditBalance } from '../services/openaiUsageApi';

interface OpenAIUsageContextType {
  usage: UsageSummary | null;
  alerts: UsageAlert[];
  creditBalance: CreditBalance | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  lastUpdated: Date | null;
}

const OpenAIUsageContext = createContext<OpenAIUsageContextType | undefined>(undefined);

interface OpenAIUsageProviderProps {
  children: React.ReactNode;
  autoRefresh?: boolean;
}

export const OpenAIUsageProvider: React.FC<OpenAIUsageProviderProps> = ({ 
  children, 
  autoRefresh = true 
}) => {
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
        const creditBalanceData = response.data.creditBalance || null;
        
        // Batch all state updates together to prevent race conditions
        const now = new Date();
        
        setUsage(summaryData);
        setAlerts(alertsData);
        setCreditBalance(creditBalanceData);
        setLastUpdated(now);
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

  const value: OpenAIUsageContextType = {
    usage,
    alerts,
    creditBalance,
    loading,
    error,
    refresh,
    lastUpdated
  };

  return (
    <OpenAIUsageContext.Provider value={value}>
      {children}
    </OpenAIUsageContext.Provider>
  );
};

export const useOpenAIUsageContext = (): OpenAIUsageContextType => {
  const context = useContext(OpenAIUsageContext);
  if (context === undefined) {
    throw new Error('useOpenAIUsageContext must be used within an OpenAIUsageProvider');
  }
  return context;
};