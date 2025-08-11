import React, { useState, useEffect } from 'react';
import { useBudgets } from '../hooks/useBudgets';
import { BudgetSummary } from '../types';
import BudgetCard from '../components/BudgetCard';
import CreateBudgetModal from '../components/CreateBudgetModal';

interface BudgetsPageProps {
  userId: string;
}

const BudgetsPage: React.FC<BudgetsPageProps> = ({ userId }) => {
  const {
    budgetSummaries,
    loading,
    error,
    createBudget,
    updateBudget,
    deleteBudget,
    getBudgetAlerts,
    refreshDashboard
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
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-6">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Budget Management</h1>
          <p className="text-gray-600 mt-1">Track and manage your spending budgets</p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          Create Budget
        </button>
      </div>

      {/* Error message */}
      {error && (
        <div className="mb-6 p-4 bg-red-100 border border-red-400 text-red-700 rounded-lg">
          {error}
        </div>
      )}

      {/* Overall Stats */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div className="bg-white p-6 rounded-lg shadow-md">
            <h3 className="text-sm font-medium text-gray-500">Total Budget</h3>
            <p className="text-2xl font-bold text-gray-900">${stats.totalBudget.toFixed(2)}</p>
          </div>
          <div className="bg-white p-6 rounded-lg shadow-md">
            <h3 className="text-sm font-medium text-gray-500">Total Spent</h3>
            <p className="text-2xl font-bold text-gray-900">${stats.totalSpent.toFixed(2)}</p>
          </div>
          <div className="bg-white p-6 rounded-lg shadow-md">
            <h3 className="text-sm font-medium text-gray-500">Budget Utilization</h3>
            <p className={`text-2xl font-bold ${
              stats.utilization > 100 ? 'text-red-600' : 
              stats.utilization > 80 ? 'text-yellow-600' : 'text-green-600'
            }`}>
              {stats.utilization.toFixed(1)}%
            </p>
          </div>
          <div className="bg-white p-6 rounded-lg shadow-md">
            <h3 className="text-sm font-medium text-gray-500">Alerts</h3>
            <p className="text-2xl font-bold text-gray-900">
              {stats.overBudgetCount + stats.nearLimitCount}
            </p>
          </div>
        </div>
      )}

      {/* Budget Alerts */}
      {budgetAlerts && (budgetAlerts.overBudget.length > 0 || budgetAlerts.nearLimit.length > 0) && (
        <div className="mb-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Budget Alerts</h2>
          <div className="space-y-3">
            {budgetAlerts.overBudget.map((budget: BudgetSummary) => (
              <div key={budget.id} className="p-4 bg-red-50 border border-red-200 rounded-lg">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <div className="ml-3">
                    <h3 className="text-sm font-medium text-red-800">
                      {budget.name} is over budget
                    </h3>
                    <p className="text-sm text-red-700">
                      You've spent ${budget.spent.toFixed(2)} of ${budget.amount.toFixed(2)} ({budget.percentageUsed.toFixed(1)}%)
                    </p>
                  </div>
                </div>
              </div>
            ))}
            
            {budgetAlerts.nearLimit.map((budget: BudgetSummary) => (
              <div key={budget.id} className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <svg className="h-5 w-5 text-yellow-400" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <div className="ml-3">
                    <h3 className="text-sm font-medium text-yellow-800">
                      {budget.name} is near its limit
                    </h3>
                    <p className="text-sm text-yellow-700">
                      You've used {budget.percentageUsed.toFixed(1)}% of your budget with {budget.daysRemaining} days remaining
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Budget List */}
      {budgetSummaries.length > 0 ? (
        <div>
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Your Budgets</h2>
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
          <div className="mx-auto h-12 w-12 text-gray-400">
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          </div>
          <h3 className="mt-2 text-sm font-medium text-gray-900">No budgets</h3>
          <p className="mt-1 text-sm text-gray-500">Get started by creating your first budget.</p>
          <div className="mt-6">
            <button
              onClick={() => setShowCreateModal(true)}
              className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700"
            >
              Create Budget
            </button>
          </div>
        </div>
      )}

      {/* Delete Confirmation */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg p-6 max-w-sm w-full">
            <h3 className="text-lg font-medium text-gray-900 mb-2">Delete Budget</h3>
            <p className="text-sm text-gray-500 mb-4">
              Are you sure you want to delete this budget? This action cannot be undone.
            </p>
            <div className="flex space-x-3">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="flex-1 px-4 py-2 text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDeleteBudget(deleteConfirm)}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

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