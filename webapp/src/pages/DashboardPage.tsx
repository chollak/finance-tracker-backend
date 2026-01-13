import React, { useState, useEffect } from 'react';
import { useDashboard } from '../hooks/useDashboard';
import { Alert, AlertSeverity } from '../types';
import { OpenAIUsageWidget } from '../components/OpenAIUsageWidget';
import { formatMoneyCompact, formatMoneyDetailed, formatPercentage } from '../utils/formatMoney';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { AlertTriangle, Info } from 'lucide-react';

interface DashboardPageProps {
  userId: string | null;
}

// Simple chart component for spending patterns
const SpendingPatternChart: React.FC<{ patterns: any[] }> = ({ patterns }) => {
  const maxAmount = Math.max(...patterns.map(p => p.averageAmount));

  return (
    <div className="space-y-2">
      {patterns.map(pattern => (
        <div key={pattern.dayOfWeek} className="flex items-center">
          <div className="w-20 text-sm text-muted-foreground">{pattern.dayOfWeek.slice(0, 3)}</div>
          <Progress
            value={maxAmount > 0 ? (pattern.averageAmount / maxAmount) * 100 : 0}
            className="h-4 flex-1 mr-2"
          />
          <div className="w-20 text-sm text-right font-medium">
            {formatMoneyCompact(pattern.averageAmount)}
          </div>
        </div>
      ))}
    </div>
  );
};

// Alert component
const AlertCard: React.FC<{ alert: Alert }> = ({ alert }) => {
  const getSeverityColor = (severity: AlertSeverity) => {
    switch (severity) {
      case AlertSeverity.CRITICAL: return 'bg-red-50 border-red-200 text-red-800';
      case AlertSeverity.HIGH: return 'bg-orange-50 border-orange-200 text-orange-800';
      case AlertSeverity.MEDIUM: return 'bg-yellow-50 border-yellow-200 text-yellow-800';
      case AlertSeverity.LOW: return 'bg-blue-50 border-blue-200 text-blue-800';
      default: return 'bg-secondary border-border text-foreground';
    }
  };

  const getSeverityIcon = (severity: AlertSeverity) => {
    if (severity === AlertSeverity.CRITICAL || severity === AlertSeverity.HIGH) {
      return <AlertTriangle className="h-5 w-5 text-red-500" />;
    }
    return <Info className="h-5 w-5 text-blue-500" />;
  };

  return (
    <div className={`p-4 rounded-lg border ${getSeverityColor(alert.severity)}`}>
      <div className="flex items-start">
        <div className="flex-shrink-0">
          {getSeverityIcon(alert.severity)}
        </div>
        <div className="ml-3 flex-1">
          <h3 className="text-sm font-medium">{alert.title}</h3>
          <p className="text-sm mt-1 opacity-90">{alert.message}</p>
          {alert.suggestions && alert.suggestions.length > 0 && (
            <div className="mt-2">
              <p className="text-xs font-medium mb-1">Suggestions:</p>
              <ul className="text-xs space-y-1">
                {alert.suggestions.slice(0, 2).map((suggestion, index) => (
                  <li key={index} className="flex items-start">
                    <span className="mr-1">•</span>
                    <span>{suggestion}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
        <div className="flex-shrink-0">
          <Badge variant="secondary" className="text-xs">
            {alert.severity}
          </Badge>
        </div>
      </div>
    </div>
  );
};

const DashboardPage: React.FC<DashboardPageProps> = ({ userId }) => {
  const {
    dashboard,
    insights,
    alerts,
    alertSummary,
    healthScore,
    loading,
    error,
    refreshDashboard
  } = useDashboard(userId || '');

  const [selectedTimeRange, setSelectedTimeRange] = useState('all');

  useEffect(() => {
    if (userId) {
      refreshDashboard();
    }
  }, [userId, refreshDashboard]);

  if (!userId) {
    return (
      <div className="max-w-6xl mx-auto p-6">
        <div className="text-center py-12">
          <p className="text-muted-foreground">Please provide a user ID to view the dashboard.</p>
        </div>
      </div>
    );
  }

  if (loading && !insights) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-6xl mx-auto p-6">
        <div className="p-4 bg-red-100 border border-red-400 text-red-700 rounded-lg">
          {error}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-8">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold ">Financial Dashboard</h1>
          <p className="text-muted-foreground mt-1">Overview of your financial health and spending patterns</p>
        </div>
        <Button
          onClick={refreshDashboard}
          disabled={loading}
        >
          {loading ? 'Refreshing...' : 'Refresh'}
        </Button>
      </div>

      {/* Key Metrics */}
      {insights && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <Card hover>
            <h3 className="text-sm font-medium text-muted-foreground">Net Income</h3>
            <p className={`text-2xl font-bold ${
              insights.financialSummary.netIncome >= 0 ? 'text-green-income' : 'text-red-expense'
            }`}>
              {formatMoneyDetailed(Math.abs(insights.financialSummary.netIncome))}
              {insights.financialSummary.netIncome < 0 && ' deficit'}
            </p>
          </Card>
          <Card hover>
            <h3 className="text-sm font-medium text-muted-foreground">Total Expenses</h3>
            <p className="text-2xl font-bold ">
              {formatMoneyDetailed(insights.financialSummary.totalExpense)}
            </p>
          </Card>
          <Card hover>
            <h3 className="text-sm font-medium text-muted-foreground">Budget Utilization</h3>
            <p className={`text-2xl font-bold ${
              insights.insights.budgetUtilization > 100 ? 'text-red-expense' :
              insights.insights.budgetUtilization > 80 ? 'text-orange-500' : 'text-green-income'
            }`}>
              {formatPercentage(insights.insights.budgetUtilization)}
            </p>
          </Card>
          <Card hover>
            <h3 className="text-sm font-medium text-muted-foreground">Savings Rate</h3>
            <p className={`text-2xl font-bold ${
              insights.insights.savingsRate >= 20 ? 'text-green-income' :
              insights.insights.savingsRate >= 10 ? 'text-orange-500' : 'text-red-expense'
            }`}>
              {formatPercentage(insights.insights.savingsRate)}
            </p>
          </Card>
        </div>
      )}

      {/* OpenAI Usage Widget */}
      <OpenAIUsageWidget className="col-span-full" />

      {/* Financial Health Score */}
      {healthScore && (
        <Card>
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold ">Financial Health Score</h2>
            <div className={`text-3xl font-bold ${
              healthScore.score >= 80 ? 'text-green-income' :
              healthScore.score >= 60 ? 'text-orange-500' : 'text-red-expense'
            }`}>
              {healthScore.score}/100
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
            <div className="text-center">
              <p className="text-sm text-muted-foreground">Budget Compliance</p>
              <p className="text-lg font-semibold">{Math.round(healthScore.factors.budgetCompliance)}</p>
            </div>
            <div className="text-center">
              <p className="text-sm text-muted-foreground">Savings Rate</p>
              <p className="text-lg font-semibold">{Math.round(healthScore.factors.savingsRate)}</p>
            </div>
            <div className="text-center">
              <p className="text-sm text-muted-foreground">Expense Stability</p>
              <p className="text-lg font-semibold">{Math.round(healthScore.factors.expenseVariability)}</p>
            </div>
            <div className="text-center">
              <p className="text-sm text-muted-foreground">Category Balance</p>
              <p className="text-lg font-semibold">{Math.round(healthScore.factors.categoryDiversification)}</p>
            </div>
          </div>

          {healthScore.recommendations.length > 0 && (
            <div className="bg-blue-50 p-4 rounded-2xl">
              <p className="text-sm font-medium  mb-2">Recommendations:</p>
              <ul className="text-sm text-muted-foreground space-y-1">
                {healthScore.recommendations.slice(0, 3).map((recommendation, index) => (
                  <li key={index} className="flex items-start">
                    <span className="mr-2">•</span>
                    <span>{recommendation}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>
      )}

      {/* Alerts Section */}
      {alerts && alerts.length > 0 && (
        <Card>
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold ">Active Alerts</h2>
            {alertSummary && (
              <div className="flex space-x-2">
                {alertSummary.critical > 0 && (
                  <Badge variant="destructive">
                    {alertSummary.critical} Critical
                  </Badge>
                )}
                {alertSummary.high > 0 && (
                  <Badge variant="outline">
                    {alertSummary.high} High
                  </Badge>
                )}
                {alertSummary.medium > 0 && (
                  <Badge variant="outline">
                    {alertSummary.medium} Medium
                  </Badge>
                )}
              </div>
            )}
          </div>
          
          <div className="space-y-4 max-h-96 overflow-y-auto">
            {alerts.slice(0, 5).map((alert) => (
              <AlertCard key={alert.id} alert={alert} />
            ))}
          </div>
        </Card>
      )}

      {/* Charts and Analytics */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Monthly Trends */}
        {insights && insights.monthlyTrends.length > 0 && (
          <Card>
            <h2 className="text-xl font-semibold  mb-4">Monthly Trends</h2>
            <div className="space-y-3">
              {insights.monthlyTrends.slice(-6).map((trend, index) => {
                const maxAmount = Math.max(
                  ...insights.monthlyTrends.map(t => Math.max(t.income, t.expenses))
                );
                
                return (
                  <div key={index} className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="font-medium">{trend.month} {trend.year}</span>
                      <span className="text-muted-foreground">Net: {formatMoneyCompact(trend.net)}</span>
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center">
                        <div className="w-16 text-xs text-muted-foreground">Income</div>
                        <div className="flex-1 bg-gray-200 rounded-full h-2 mr-2">
                          <div
                            className="bg-green-income h-2 rounded-full"
                            style={{ width: `${(trend.income / maxAmount) * 100}%` }}
                          ></div>
                        </div>
                        <div className="w-20 text-xs text-right">{formatMoneyCompact(trend.income)}</div>
                      </div>
                      <div className="flex items-center">
                        <div className="w-16 text-xs text-muted-foreground">Expenses</div>
                        <div className="flex-1 bg-gray-200 rounded-full h-2 mr-2">
                          <div
                            className="bg-red-expense h-2 rounded-full"
                            style={{ width: `${(trend.expenses / maxAmount) * 100}%` }}
                          ></div>
                        </div>
                        <div className="w-20 text-xs text-right">{formatMoneyCompact(trend.expenses)}</div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        )}

        {/* Spending Patterns */}
        {insights && insights.spendingPatterns.length > 0 && (
          <Card>
            <h2 className="text-xl font-semibold  mb-4">Weekly Spending Pattern</h2>
            <SpendingPatternChart patterns={insights.spendingPatterns} />
            <div className="mt-4 text-sm text-muted-foreground">
              <p>Peak spending day: <span className="font-medium ">{insights.insights.topSpendingDay}</span></p>
            </div>
          </Card>
        )}

        {/* Top Categories */}
        {insights && insights.topCategories.length > 0 && (
          <Card>
            <h2 className="text-xl font-semibold  mb-4">Top Spending Categories</h2>
            <div className="space-y-3">
              {insights.topCategories.map((category, index) => (
                <div key={index} className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                      <span className="text-blue-600 font-medium text-sm">{index + 1}</span>
                    </div>
                    <span className="font-medium">{category.category}</span>
                  </div>
                  <div className="text-right">
                    <div className="font-semibold">{formatMoneyCompact(category.amount)}</div>
                    <div className="text-sm text-muted-foreground">{formatPercentage(category.percentage)}</div>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Budget Overview */}
        {insights && (
          <Card>
            <h2 className="text-xl font-semibold  mb-4">Budget Overview</h2>
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Active Budgets</span>
                <span className="font-semibold">{insights.budgetOverview.activeBudgets}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Total Budget</span>
                <span className="font-semibold">{formatMoneyDetailed(insights.budgetOverview.totalBudgetAmount)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Total Spent</span>
                <span className="font-semibold">{formatMoneyDetailed(insights.budgetOverview.totalSpent)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Over Budget</span>
                <span className={`font-semibold ${
                  insights.budgetOverview.overBudgetCount > 0 ? 'text-red-expense' : 'text-green-income'
                }`}>
                  {insights.budgetOverview.overBudgetCount} budgets
                </span>
              </div>

              {insights.budgetAlerts.recommendations.length > 0 && (
                <div className="mt-4 p-3 bg-orange-50 rounded-2xl">
                  <p className="text-sm font-medium  mb-1">Budget Tips:</p>
                  <p className="text-sm text-muted-foreground">
                    {insights.budgetAlerts.recommendations[0]}
                  </p>
                </div>
              )}
            </div>
          </Card>
        )}
      </div>

      {/* Quick Actions */}
      <Card>
        <h2 className="text-xl font-semibold  mb-4">Quick Actions</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <a
            href={`/webapp/budgets?userId=${userId}`}
            className="block p-4 bg-blue-50 rounded-2xl hover:opacity-90 transition-opacity"
          >
            <div className="flex items-center space-x-3">
              <div className="text-2xl">🎯</div>
              <div>
                <p className="font-medium ">Manage Budgets</p>
                <p className="text-sm text-muted-foreground">Create and edit your budgets</p>
              </div>
            </div>
          </a>
          <a
            href={`/webapp/transactions?userId=${userId}`}
            className="block p-4 bg-green-50 rounded-2xl hover:opacity-90 transition-opacity"
          >
            <div className="flex items-center space-x-3">
              <div className="text-2xl">💳</div>
              <div>
                <p className="font-medium ">View Transactions</p>
                <p className="text-sm text-muted-foreground">Check recent transactions</p>
              </div>
            </div>
          </a>
          <a
            href={`/webapp/stats?userId=${userId}`}
            className="block p-4 bg-purple-50 rounded-2xl hover:opacity-90 transition-opacity"
          >
            <div className="flex items-center space-x-3">
              <div className="text-2xl">📊</div>
              <div>
                <p className="font-medium ">Analytics</p>
                <p className="text-sm text-muted-foreground">Detailed spending analysis</p>
              </div>
            </div>
          </a>
        </div>
      </Card>
    </div>
  );
};

export default DashboardPage;