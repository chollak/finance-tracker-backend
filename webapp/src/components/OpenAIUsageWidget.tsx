import React from 'react';
import { useOpenAIUsageContext } from '../contexts/OpenAIUsageContext';
import { formatMoneyDetailed, formatPercentage } from '../utils/formatMoney';

interface OpenAIUsageWidgetProps {
  compact?: boolean;
  className?: string;
}

export const OpenAIUsageWidget: React.FC<OpenAIUsageWidgetProps> = ({ 
  compact = false, 
  className = "" 
}) => {
  const { usage, alerts, creditBalance, loading, error, refresh, lastUpdated } = useOpenAIUsageContext();

  // Show loading state until we have at least the usage data
  if (loading && !usage) {
    return (
      <div className={`bg-white rounded-lg shadow-md p-4 ${className}`}>
        <div className="animate-pulse">
          <div className="h-4 bg-gray-200 rounded w-1/2 mb-2"></div>
          <div className="h-8 bg-gray-200 rounded w-3/4"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`bg-white rounded-lg shadow-md p-4 ${className}`}>
        <div className="text-red-600">
          <h3 className="font-semibold mb-2">⚠️ OpenAI Usage Error</h3>
          <p className="text-sm">{error}</p>
          <button 
            onClick={refresh}
            className="mt-2 px-3 py-1 bg-red-100 hover:bg-red-200 rounded text-sm"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!usage) {
    return (
      <div className={`bg-white rounded-lg shadow-md p-4 ${className}`}>
        <div className="text-gray-500">
          <p>OpenAI usage data not available</p>
        </div>
      </div>
    );
  }

  const costPercentage = usage.utilization.costPercentage;
  const remainingBudget = usage.limits.hardLimit - usage.currentUsage.totalCost;

  const getProgressColor = (percentage: number) => {
    if (percentage >= 90) return 'bg-red-500';
    if (percentage >= 75) return 'bg-yellow-500';
    if (percentage >= 50) return 'bg-blue-500';
    return 'bg-green-500';
  };

  const getAlertColor = (level: string) => {
    switch (level) {
      case 'danger': return 'bg-red-100 text-red-800 border-red-200';
      case 'warning': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'info': return 'bg-blue-100 text-blue-800 border-blue-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  if (compact) {
    return (
      <div className={`bg-white rounded-lg shadow-md p-3 ${className}`}>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold">🤖 OpenAI Credits</h3>
          <button 
            onClick={refresh}
            disabled={loading}
            className="text-xs text-blue-600 hover:text-blue-800 disabled:opacity-50"
          >
            {loading ? '↻' : '🔄'}
          </button>
        </div>
        
        <div className="space-y-2">
          {/* Credit Balance Section - show loading placeholder if still loading */}
          {creditBalance && creditBalance.available !== undefined ? (
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="font-semibold text-green-600">
                  💰 {formatMoneyDetailed(creditBalance.available)} Available
                </span>
                <span className="text-gray-500">
                  {formatMoneyDetailed(creditBalance.total)} Total
                </span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div 
                  className={`h-2 rounded-full transition-all duration-300 ${creditBalance.available < 5 ? 'bg-red-500' : creditBalance.available < 10 ? 'bg-yellow-500' : 'bg-green-500'}`}
                  style={{ width: `${Math.min(100, (creditBalance.available / creditBalance.total) * 100)}%` }}
                ></div>
              </div>
            </div>
          ) : loading ? (
            <div className="animate-pulse">
              <div className="flex justify-between text-xs mb-1">
                <div className="h-3 bg-gray-200 rounded w-20"></div>
                <div className="h-3 bg-gray-200 rounded w-16"></div>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2"></div>
            </div>
          ) : (
            <div className="text-xs text-gray-500">
              Credit data unavailable
            </div>
          )}
          <div>
            <div className="flex justify-between text-xs mb-1">
              <span>Cost: {formatMoneyDetailed(usage.currentUsage.totalCost)}</span>
              <span>{formatMoneyDetailed(remainingBudget)} left</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div 
                className={`h-2 rounded-full transition-all duration-300 ${getProgressColor(costPercentage)}`}
                style={{ width: `${Math.min(100, costPercentage)}%` }}
              ></div>
            </div>
          </div>

          {alerts.length > 0 && (
            <div className={`text-xs p-2 rounded border ${getAlertColor(alerts[0].level)}`}>
              {alerts[0].message}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={`bg-white rounded-lg shadow-md p-6 ${className}`}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold">🤖 OpenAI API Usage</h3>
        <div className="flex items-center space-x-2">
          {lastUpdated && (
            <span className="text-xs text-gray-500">
              Updated {lastUpdated.toLocaleTimeString()}
            </span>
          )}
          <button 
            onClick={refresh}
            disabled={loading}
            className="px-3 py-1 bg-blue-100 hover:bg-blue-200 rounded text-sm disabled:opacity-50"
          >
            {loading ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* Credit Balance - Most Important */}
      {/* Credit Balance - Most Important */}
      <div className="bg-gradient-to-r from-green-50 to-blue-50 p-6 rounded-lg mb-6 border border-green-200">
        <div className="flex items-center justify-between mb-4">
          <h4 className="text-lg font-semibold text-green-800">💰 Credit Balance</h4>
          <div className="text-sm text-gray-600">
            {creditBalance ? (
              `${formatMoneyDetailed(creditBalance.used)} of ${formatMoneyDetailed(creditBalance.total)} used`
            ) : (
              <div className="h-4 bg-gray-200 rounded w-24 animate-pulse"></div>
            )}
          </div>
        </div>
        
        {creditBalance ? (
          <>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="text-center">
                <div className="text-3xl font-bold text-green-600">
                  {formatMoneyDetailed(creditBalance.available)}
                </div>
                <div className="text-sm text-gray-600">Available Credits</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-blue-600">
                  {formatPercentage((creditBalance.available / creditBalance.total) * 100)}
                </div>
                <div className="text-sm text-gray-600">Remaining</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-gray-600">
                  {formatMoneyDetailed(creditBalance.total)}
                </div>
                <div className="text-sm text-gray-600">Total Credits</div>
              </div>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-3 mt-4">
              <div 
                className={`h-3 rounded-full transition-all duration-300 ${
                  creditBalance.available < 5 ? 'bg-red-500' : 
                  creditBalance.available < 10 ? 'bg-yellow-500' : 
                  'bg-green-500'
                }`}
                style={{ width: `${Math.min(100, (creditBalance.available / creditBalance.total) * 100)}%` }}
              ></div>
            </div>
          </>
        ) : (
          <div className="animate-pulse">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="text-center">
                <div className="h-10 bg-gray-200 rounded w-16 mx-auto mb-2"></div>
                <div className="h-3 bg-gray-200 rounded w-20 mx-auto"></div>
              </div>
              <div className="text-center">
                <div className="h-10 bg-gray-200 rounded w-16 mx-auto mb-2"></div>
                <div className="h-3 bg-gray-200 rounded w-16 mx-auto"></div>
              </div>
              <div className="text-center">
                <div className="h-10 bg-gray-200 rounded w-16 mx-auto mb-2"></div>
                <div className="h-3 bg-gray-200 rounded w-20 mx-auto"></div>
              </div>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-3 mt-4"></div>
          </div>
        )}
      </div>

      {/* Usage Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-gray-50 p-4 rounded">
          <div className="text-2xl font-bold text-blue-600">
            {formatMoneyDetailed(usage.currentUsage.totalCost)}
          </div>
          <div className="text-sm text-gray-600">Total Cost</div>
        </div>
        
        <div className="bg-gray-50 p-4 rounded">
          <div className="text-2xl font-bold text-green-600">
            {usage.currentUsage.totalTokens.toLocaleString()}
          </div>
          <div className="text-sm text-gray-600">Total Tokens</div>
        </div>
        
        <div className="bg-gray-50 p-4 rounded">
          <div className="text-2xl font-bold text-purple-600">
            {usage.currentUsage.totalRequests.toLocaleString()}
          </div>
          <div className="text-sm text-gray-600">Total Requests</div>
        </div>
      </div>

      {/* Budget Progress */}
      <div className="mb-6">
        <div className="flex justify-between items-center mb-2">
          <span className="text-sm font-medium">Budget Usage</span>
          <span className="text-sm text-gray-600">
            {formatMoneyDetailed(remainingBudget)} of {formatMoneyDetailed(usage.limits.hardLimit)} remaining
          </span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-4">
          <div 
            className={`h-4 rounded-full transition-all duration-300 ${getProgressColor(costPercentage)}`}
            style={{ width: `${Math.min(100, costPercentage)}%` }}
          ></div>
        </div>
        <div className="text-center text-sm text-gray-600 mt-1">
          {formatPercentage(costPercentage)} used
        </div>
      </div>

      {/* Alerts */}
      {alerts.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-semibold">Alerts</h4>
          {alerts.map((alert, index) => (
            <div 
              key={index}
              className={`p-3 rounded border ${getAlertColor(alert.level)}`}
            >
              {alert.message}
            </div>
          ))}
        </div>
      )}

      {/* Limits Information */}
      <div className="mt-4 pt-4 border-t text-xs text-gray-500">
        <div className="grid grid-cols-2 gap-2">
          <div>Hard Limit: ${usage.limits.hardLimit}</div>
          <div>Soft Limit: ${usage.limits.softLimit}</div>
        </div>
      </div>
    </div>
  );
};