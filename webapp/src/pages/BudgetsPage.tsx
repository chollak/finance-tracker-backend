import React, { useState, useEffect } from 'react';
import { useBudgets } from '../hooks/useBudgets';
import { BudgetSummary } from '../types';
import BudgetCard from '../components/BudgetCard';
import CreateBudgetModal from '../components/CreateBudgetModal';
import ConfirmDialog from '../components/ConfirmDialog';
import { formatMoneyDetailed, formatPercentage } from '../utils/formatMoney';
import { Card, CardHeader, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertTriangle, BarChart3 } from 'lucide-react';

interface BudgetsPageProps {
  userId: string | null;
}

const BudgetsPage: React.FC<BudgetsPageProps> = ({ userId }) => {
  const {
    budgetSummaries,
    loading,
    error,
    createBudget,
    updateBudget,
    deleteBudget,
    getBudgetAlerts
  } = useBudgets(userId);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [budgetAlerts, setBudgetAlerts] = useState<any>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  // Load budget alerts on component mount
  useEffect(() => {
    const loadAlerts = async () => {
      const alerts = await getBudgetAlerts();
      setBudgetAlerts(alerts);
    };
    
    if (userId) {
      loadAlerts();
    }
  }, [userId, getBudgetAlerts]);

  const handleCreateBudget = async (budgetData: any) => {
    const newBudget = await createBudget(budgetData);
    if (newBudget) {
      setShowCreateModal(false);
      // Refresh alerts
      const alerts = await getBudgetAlerts();
      setBudgetAlerts(alerts);
    }
  };

  const handleEditBudget = (budget: BudgetSummary) => {
    // For now, we'll just log this - you can implement edit modal later
    console.log('Edit budget:', budget);
    // You could open an edit modal here similar to create modal
  };

  const handleDeleteBudget = async (budgetId: string) => {
    if (deleteConfirm === budgetId) {
      const success = await deleteBudget(budgetId);
      if (success) {
        setDeleteConfirm(null);
        // Refresh alerts
        const alerts = await getBudgetAlerts();
        setBudgetAlerts(alerts);
      }
    } else {
      setDeleteConfirm(budgetId);
    }
  };

  const calculateOverallStats = () => {
    if (!budgetSummaries.length) return null;

    const totalBudget = budgetSummaries.reduce((sum, b) => sum + b.amount, 0);
    const totalSpent = budgetSummaries.reduce((sum, b) => sum + b.spent, 0);
    const overBudgetCount = budgetSummaries.filter(b => b.isOverBudget).length;
    const nearLimitCount = budgetSummaries.filter(b => !b.isOverBudget && b.percentageUsed >= 80).length;

    return {
      totalBudget,
      totalSpent,
      overBudgetCount,
      nearLimitCount,
      utilization: totalBudget > 0 ? (totalSpent / totalBudget) * 100 : 0
    };
  };

  const stats = calculateOverallStats();

  if (loading && !budgetSummaries.length) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-6">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold">Budget Management</h1>
          <p className="text-muted-foreground mt-1">Track and manage your spending budgets</p>
        </div>
        <Button onClick={() => setShowCreateModal(true)}>
          Create Budget
        </Button>
      </div>

      {/* Error message */}
      {error && (
        <Alert variant="destructive" className="mb-6">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Overall Stats */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <Card className="hover:shadow-md transition-shadow">
            <CardContent className="pt-6">
              <h3 className="text-sm font-medium text-muted-foreground">Total Budget</h3>
              <p className="text-2xl font-bold">{formatMoneyDetailed(stats.totalBudget)}</p>
            </CardContent>
          </Card>
          <Card className="hover:shadow-md transition-shadow">
            <CardContent className="pt-6">
              <h3 className="text-sm font-medium text-muted-foreground">Total Spent</h3>
              <p className="text-2xl font-bold">{formatMoneyDetailed(stats.totalSpent)}</p>
            </CardContent>
          </Card>
          <Card className="hover:shadow-md transition-shadow">
            <CardContent className="pt-6">
              <h3 className="text-sm font-medium text-muted-foreground">Budget Utilization</h3>
              <p className={`text-2xl font-bold ${
                stats.utilization > 100 ? 'text-red-expense' :
                stats.utilization > 80 ? 'text-orange-500' : 'text-green-income'
              }`}>
                {formatPercentage(stats.utilization)}
              </p>
            </CardContent>
          </Card>
          <Card className="hover:shadow-md transition-shadow">
            <CardContent className="pt-6">
              <h3 className="text-sm font-medium text-muted-foreground">Alerts</h3>
              <p className="text-2xl font-bold">
                {stats.overBudgetCount + stats.nearLimitCount}
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Budget Alerts */}
      {budgetAlerts && (budgetAlerts.overBudget.length > 0 || budgetAlerts.nearLimit.length > 0) && (
        <div className="mb-8">
          <h2 className="text-xl font-semibold mb-4">Budget Alerts</h2>
          <div className="space-y-3">
            {budgetAlerts.overBudget.map((budget: BudgetSummary) => (
              <Alert key={budget.id} variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>{budget.name} is over budget</AlertTitle>
                <AlertDescription>
                  You've spent {formatMoneyDetailed(budget.spent)} of {formatMoneyDetailed(budget.amount)} ({formatPercentage(budget.percentageUsed)})
                </AlertDescription>
              </Alert>
            ))}

            {budgetAlerts.nearLimit.map((budget: BudgetSummary) => (
              <Alert key={budget.id} className="bg-orange-50 border-orange-200">
                <AlertTriangle className="h-4 w-4 text-orange-600" />
                <AlertTitle className="text-orange-800">{budget.name} is near its limit</AlertTitle>
                <AlertDescription className="text-orange-700">
                  You've used {formatPercentage(budget.percentageUsed)} of your budget with {budget.daysRemaining} days remaining
                </AlertDescription>
              </Alert>
            ))}
          </div>
        </div>
      )}

      {/* Budget List */}
      {budgetSummaries.length > 0 ? (
        <div>
          <h2 className="text-xl font-semibold mb-4">Your Budgets</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {budgetSummaries.map((budget) => (
              <BudgetCard
                key={budget.id}
                budget={budget}
                onEdit={handleEditBudget}
                onDelete={handleDeleteBudget}
              />
            ))}
          </div>
        </div>
      ) : (
        <div className="text-center py-12">
          <BarChart3 className="mx-auto h-12 w-12 text-muted-foreground" />
          <h3 className="mt-2 text-sm font-medium">No budgets</h3>
          <p className="mt-1 text-sm text-muted-foreground">Get started by creating your first budget.</p>
          <div className="mt-6">
            <Button onClick={() => setShowCreateModal(true)}>
              Create Budget
            </Button>
          </div>
        </div>
      )}

      {/* Delete Confirmation */}
      <ConfirmDialog
        isOpen={!!deleteConfirm}
        onClose={() => setDeleteConfirm(null)}
        onConfirm={() => handleDeleteBudget(deleteConfirm!)}
        title="Delete Budget"
        message="Are you sure you want to delete this budget? This action cannot be undone."
        confirmText="Delete"
        cancelText="Cancel"
        isLoading={loading}
      />

      {/* Create Budget Modal */}
      <CreateBudgetModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onSubmit={handleCreateBudget}
        loading={loading}
      />
    </div>
  );
};

export default BudgetsPage;