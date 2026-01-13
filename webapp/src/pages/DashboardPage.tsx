import React, { useState, useEffect } from 'react';
import { useDashboard } from '../hooks/useDashboard';
import { Alert, AlertSeverity } from '../types';
import { OpenAIUsageWidget } from '../components/OpenAIUsageWidget';
import { formatMoneyCompact, formatMoneyDetailed, formatPercentage } from '../utils/formatMoney';
import { Card, Button, Badge } from '../design-system/components';

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
          <div className="w-20 text-sm text-gray-600">{pattern.dayOfWeek.slice(0, 3)}</div>
          <div className="flex-1 bg-gray-200 rounded-full h-4 mr-2">
            <div
              className="bg-card-dark h-4 rounded-full transition-all duration-300"
              style={{
                width: maxAmount > 0 ? `${(pattern.averageAmount / maxAmount) * 100}%` : '0%'
              }}
            ></div>
          </div>
          <div className="w-20 text-sm text-card-dark text-right">
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
      default: return 'bg-gray-50 border-gray-200 text-gray-800';
    }
  };

  const getSeverityIcon = (severity: AlertSeverity) => {
    if (severity === AlertSeverity.CRITICAL || severity === AlertSeverity.HIGH) {
      return (
        <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
        </svg>
      );
    }
    return (
      <svg className="h-5 w-5 text-blue-400" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
      </svg>
    );
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
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-white bg-opacity-50">
            {alert.severity}
          </span>
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
          <p className="text-gray-500">Please provide a user ID to view the dashboard.</p>
        </div>
      </div>
    );
  }

  if (loading && !insights) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-card-dark"></div>
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
          <h1 className="text-3xl font-bold text-card-dark">Financial Dashboard</h1>
          <p className="text-gray-600 mt-1">Overview of your financial health and spending patterns</p>
        </div>
        <Button
          onClick={refreshDashboard}
          disabled={loading}
          variant="primary"
          size="md"
        >
          {loading ? 'Refreshing...' : 'Refresh'}
        </Button>
      </div>

      {/* Key Metrics */}
      {insights && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <Card variant="white" rounded="3xl" padding="md" hover>
            <h3 className="text-sm font-medium text-gray-500">Net Income</h3>
            <p className={`text-2xl font-bold ${
              insights.financialSummary.netIncome >= 0 ? 'text-green-income' : 'text-red-expense'
            }`}>
              {formatMoneyDetailed(Math.abs(insights.financialSummary.netIncome))}
              {insights.financialSummary.netIncome < 0 && ' deficit'}
            </p>
          </Card>
          <Card variant="white" rounded="3xl" padding="md" hover>
            <h3 className="text-sm font-medium text-gray-500">Total Expenses</h3>
            <p className="text-2xl font-bold text-card-dark">
              {formatMoneyDetailed(insights.financialSummary.totalExpense)}
            </p>
          </Card>
          <Card variant="white" rounded="3xl" padding="md" hover>
            <h3 className="text-sm font-medium text-gray-500">Budget Utilization</h3>
            <p className={`text-2xl font-bold ${
              insights.insights.budgetUtilization > 100 ? 'text-red-expense' :
              insights.insights.budgetUtilization > 80 ? 'text-light-yellow' : 'text-green-income'
            }`}>
              {formatPercentage(insights.insights.budgetUtilization)}
            </p>
          </Card>
          <Card variant="white" rounded="3xl" padding="md" hover>
            <h3 className="text-sm font-medium text-gray-500">Savings Rate</h3>
            <p className={`text-2xl font-bold ${
              insights.insights.savingsRate >= 20 ? 'text-green-income' :
              insights.insights.savingsRate >= 10 ? 'text-light-yellow' : 'text-red-expense'
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
        <Card variant="white" rounded="3xl" padding="lg">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold text-card-dark">Financial Health Score</h2>
            <div className={`text-3xl font-bold ${
              healthScore.score >= 80 ? 'text-green-income' :
              healthScore.score >= 60 ? 'text-light-yellow' : 'text-red-expense'
            }`}>
              {healthScore.score}/100
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
            <div className="text-center">
              <p className="text-sm text-gray-500">Budget Compliance</p>
              <p className="text-lg font-semibold">{Math.round(healthScore.factors.budgetCompliance)}</p>
            </div>
            <div className="text-center">
              <p className="text-sm text-gray-500">Savings Rate</p>
              <p className="text-lg font-semibold">{Math.round(healthScore.factors.savingsRate)}</p>
            </div>
            <div className="text-center">
              <p className="text-sm text-gray-500">Expense Stability</p>
              <p className="text-lg font-semibold">{Math.round(healthScore.factors.expenseVariability)}</p>
            </div>
            <div className="text-center">
              <p className="text-sm text-gray-500">Category Balance</p>
              <p className="text-lg font-semibold">{Math.round(healthScore.factors.categoryDiversification)}</p>
            </div>
          </div>

          {healthScore.recommendations.length > 0 && (
            <div className="bg-light-blue p-4 rounded-2xl">
              <p className="text-sm font-medium text-card-dark mb-2">Recommendations:</p>
              <ul className="text-sm text-gray-700 space-y-1">
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
        <Card variant="white" rounded="3xl" padding="lg">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold text-card-dark">Active Alerts</h2>
            {alertSummary && (
              <div className="flex space-x-2">
                {alertSummary.critical > 0 && (
                  <Badge variant="error">
                    {alertSummary.critical} Critical
                  </Badge>
                )}
                {alertSummary.high > 0 && (
                  <Badge variant="warning">
                    {alertSummary.high} High
                  </Badge>
                )}
                {alertSummary.medium > 0 && (
                  <Badge variant="warning">
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
          <Card variant="white" rounded="3xl" padding="lg">
            <h2 className="text-xl font-semibold text-card-dark mb-4">Monthly Trends</h2>
            <div className="space-y-3">
              {insights.monthlyTrends.slice(-6).map((trend, index) => {
                const maxAmount = Math.max(
                  ...insights.monthlyTrends.map(t => Math.max(t.income, t.expenses))
                );
                
                return (
                  <div key={index} className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="font-medium">{trend.month} {trend.year}</span>
                      <span className="text-gray-500">Net: {formatMoneyCompact(trend.net)}</span>
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center">
                        <div className="w-16 text-xs text-gray-600">Income</div>
                        <div className="flex-1 bg-gray-200 rounded-full h-2 mr-2">
                          <div
                            className="bg-green-income h-2 rounded-full"
                            style={{ width: `${(trend.income / maxAmount) * 100}%` }}
                          ></div>
                        </div>
                        <div className="w-20 text-xs text-right">{formatMoneyCompact(trend.income)}</div>
                      </div>
                      <div className="flex items-center">
                        <div className="w-16 text-xs text-gray-600">Expenses</div>
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
          <Card variant="white" rounded="3xl" padding="lg">
            <h2 className="text-xl font-semibold text-card-dark mb-4">Weekly Spending Pattern</h2>
            <SpendingPatternChart patterns={insights.spendingPatterns} />
            <div className="mt-4 text-sm text-gray-600">
              <p>Peak spending day: <span className="font-medium text-card-dark">{insights.insights.topSpendingDay}</span></p>
            </div>
          </Card>
        )}

        {/* Top Categories */}
        {insights && insights.topCategories.length > 0 && (
          <Card variant="white" rounded="3xl" padding="lg">
            <h2 className="text-xl font-semibold text-card-dark mb-4">Top Spending Categories</h2>
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
                    <div className="text-sm text-gray-500">{formatPercentage(category.percentage)}</div>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Budget Overview */}
        {insights && (
          <Card variant="white" rounded="3xl" padding="lg">
            <h2 className="text-xl font-semibold text-card-dark mb-4">Budget Overview</h2>
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-gray-600">Active Budgets</span>
                <span className="font-semibold">{insights.budgetOverview.activeBudgets}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-600">Total Budget</span>
                <span className="font-semibold">{formatMoneyDetailed(insights.budgetOverview.totalBudgetAmount)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-600">Total Spent</span>
                <span className="font-semibold">{formatMoneyDetailed(insights.budgetOverview.totalSpent)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-600">Over Budget</span>
                <span className={`font-semibold ${
                  insights.budgetOverview.overBudgetCount > 0 ? 'text-red-expense' : 'text-green-income'
                }`}>
                  {insights.budgetOverview.overBudgetCount} budgets
                </span>
              </div>

              {insights.budgetAlerts.recommendations.length > 0 && (
                <div className="mt-4 p-3 bg-light-yellow rounded-2xl">
                  <p className="text-sm font-medium text-card-dark mb-1">Budget Tips:</p>
                  <p className="text-sm text-gray-700">
                    {insights.budgetAlerts.recommendations[0]}
                  </p>
                </div>
              )}
            </div>
          </Card>
        )}
      </div>

      {/* Quick Actions */}
      <Card variant="white" rounded="3xl" padding="lg">
        <h2 className="text-xl font-semibold text-card-dark mb-4">Quick Actions</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <a
            href={`/webapp/budgets?userId=${userId}`}
            className="block p-4 bg-light-blue rounded-2xl hover:opacity-90 transition-opacity"
          >
            <div className="flex items-center space-x-3">
              <div className="text-2xl">🎯</div>
              <div>
                <p className="font-medium text-card-dark">Manage Budgets</p>
                <p className="text-sm text-gray-600">Create and edit your budgets</p>
              </div>
            </div>
          </a>
          <a
            href={`/webapp/transactions?userId=${userId}`}
            className="block p-4 bg-lime rounded-2xl hover:opacity-90 transition-opacity"
          >
            <div className="flex items-center space-x-3">
              <div className="text-2xl">💳</div>
              <div>
                <p className="font-medium text-card-dark">View Transactions</p>
                <p className="text-sm text-gray-700">Check recent transactions</p>
              </div>
            </div>
          </a>
          <a
            href={`/webapp/stats?userId=${userId}`}
            className="block p-4 bg-lavender rounded-2xl hover:opacity-90 transition-opacity"
          >
            <div className="flex items-center space-x-3">
              <div className="text-2xl">📊</div>
              <div>
                <p className="font-medium text-card-dark">Analytics</p>
                <p className="text-sm text-gray-700">Detailed spending analysis</p>
              </div>
            </div>
          </a>
        </div>
      </Card>
    </div>
  );
};

export default DashboardPage;