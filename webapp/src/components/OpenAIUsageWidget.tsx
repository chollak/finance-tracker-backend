import React from 'react';
import { useOpenAIUsageContext } from '../contexts/OpenAIUsageContext';
import { formatMoneyDetailed, formatPercentage } from '../utils/formatMoney';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';

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
      <Card className={className}>
        <CardContent className="pt-6">
          <div className="animate-pulse">
            <div className="h-4 bg-gray-200 rounded w-1/2 mb-2"></div>
            <div className="h-8 bg-gray-200 rounded w-3/4"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className={className}>
        <CardContent className="pt-6">
          <div className="text-red-expense">
            <h3 className="font-semibold mb-2">⚠️ OpenAI Usage Error</h3>
            <p className="text-sm">{error}</p>
            <Button
              onClick={refresh}
              variant="secondary"
              size="sm"
              className="mt-2"
            >
              Retry
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!usage) {
    return (
      <Card className={className}>
        <CardContent className="pt-6">
          <div className="text-muted-foreground">
            <p>OpenAI usage data not available</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const costPercentage = usage.utilization.costPercentage;
  const remainingBudget = usage.limits.hardLimit - usage.currentUsage.totalCost;

  const getProgressColor = (percentage: number) => {
    if (percentage >= 90) return 'bg-red-expense';
    if (percentage >= 75) return 'bg-orange-500';
    if (percentage >= 50) return 'bg-blue-500';
    return 'bg-green-income';
  };

  const getAlertVariant = (level: string): "default" | "destructive" | "secondary" | "outline" | null | undefined => {
    switch (level) {
      case 'danger': return 'destructive';
      case 'warning': return 'outline';
      default: return 'secondary';
    }
  };

  if (compact) {
    return (
      <Card className={className}>
        <CardContent className="pt-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold">🤖 OpenAI Credits</h3>
            <Button
              onClick={refresh}
              disabled={loading}
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0"
            >
              {loading ? '↻' : '🔄'}
            </Button>
          </div>

          <div className="space-y-2">
            {/* Credit Balance Section - show loading placeholder if still loading */}
            {creditBalance && creditBalance.available !== undefined ? (
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="font-semibold text-green-income">
                    💰 {formatMoneyDetailed(creditBalance.available)} Available
                  </span>
                  <span className="text-muted-foreground">
                    {formatMoneyDetailed(creditBalance.total)} Total
                  </span>
                </div>
                <Progress
                  value={Math.min(100, (creditBalance.available / creditBalance.total) * 100)}
                  className="h-2"
                />
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
              <div className="text-xs text-muted-foreground">
                Credit data unavailable
              </div>
            )}
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span>Cost: {formatMoneyDetailed(usage.currentUsage.totalCost)}</span>
                <span>{formatMoneyDetailed(remainingBudget)} left</span>
              </div>
              <Progress
                value={Math.min(100, costPercentage)}
                className="h-2"
              />
            </div>

            {alerts.length > 0 && (
              <Badge variant={getAlertVariant(alerts[0].level)} className="text-xs">
                {alerts[0].message}
              </Badge>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={className}>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">🤖 OpenAI API Usage</h3>
          <div className="flex items-center space-x-2">
            {lastUpdated && (
              <span className="text-xs text-muted-foreground">
                Updated {lastUpdated.toLocaleTimeString()}
              </span>
            )}
            <Button
              onClick={refresh}
              disabled={loading}
              variant="secondary"
              size="sm"
            >
              {loading ? 'Refreshing...' : 'Refresh'}
            </Button>
          </div>
        </div>

        {/* Credit Balance - Most Important */}
        <div className="bg-gradient-to-r from-green-50 to-blue-50 p-6 rounded-lg mb-6 border border-green-200">
          <div className="flex items-center justify-between mb-4">
            <h4 className="text-lg font-semibold text-green-800">💰 Credit Balance</h4>
            <div className="text-sm text-muted-foreground">
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
                  <div className="text-3xl font-bold text-green-income">
                    {formatMoneyDetailed(creditBalance.available)}
                  </div>
                  <div className="text-sm text-muted-foreground">Available Credits</div>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold">
                    {formatPercentage((creditBalance.available / creditBalance.total) * 100)}
                  </div>
                  <div className="text-sm text-muted-foreground">Remaining</div>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold text-muted-foreground">
                    {formatMoneyDetailed(creditBalance.total)}
                  </div>
                  <div className="text-sm text-muted-foreground">Total Credits</div>
                </div>
              </div>
              <Progress
                value={Math.min(100, (creditBalance.available / creditBalance.total) * 100)}
                className="h-3 mt-4"
              />
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
              <Progress value={0} className="h-3 mt-4" />
            </div>
          )}
        </div>

        {/* Usage Statistics */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="bg-secondary/50 p-4 rounded-lg">
            <div className="text-2xl font-bold">
              {formatMoneyDetailed(usage.currentUsage.totalCost)}
            </div>
            <div className="text-sm text-muted-foreground">Total Cost</div>
          </div>

          <div className="bg-secondary/50 p-4 rounded-lg">
            <div className="text-2xl font-bold text-green-income">
              {usage.currentUsage.totalTokens.toLocaleString()}
            </div>
            <div className="text-sm text-muted-foreground">Total Tokens</div>
          </div>

          <div className="bg-secondary/50 p-4 rounded-lg">
            <div className="text-2xl font-bold text-purple-600">
              {usage.currentUsage.totalRequests.toLocaleString()}
            </div>
            <div className="text-sm text-muted-foreground">Total Requests</div>
          </div>
        </div>

        {/* Budget Progress */}
        <div className="mb-6">
          <div className="flex justify-between items-center mb-2">
            <span className="text-sm font-medium">Budget Usage</span>
            <span className="text-sm text-muted-foreground">
              {formatMoneyDetailed(remainingBudget)} of {formatMoneyDetailed(usage.limits.hardLimit)} remaining
            </span>
          </div>
          <Progress
            value={Math.min(100, costPercentage)}
            className="h-4"
          />
          <div className="text-center text-sm text-muted-foreground mt-1">
            {formatPercentage(costPercentage)} used
          </div>
        </div>

        {/* Alerts */}
        {alerts.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-sm font-semibold">Alerts</h4>
            {alerts.map((alert, index) => (
              <Badge
                key={index}
                variant={getAlertVariant(alert.level)}
                className="block w-full p-3 text-left"
              >
                {alert.message}
              </Badge>
            ))}
          </div>
        )}

        {/* Limits Information */}
        <div className="mt-4 pt-4 border-t text-xs text-muted-foreground">
          <div className="grid grid-cols-2 gap-2">
            <div>Hard Limit: ${usage.limits.hardLimit}</div>
            <div>Soft Limit: ${usage.limits.softLimit}</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};