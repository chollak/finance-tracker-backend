import React from 'react';
import { BudgetSummary, BudgetPeriod } from '../types';
import { formatMoneyDetailed, formatPercentage } from '../utils/formatMoney';

interface BudgetCardProps {
  budget: BudgetSummary;
  onEdit: (budget: BudgetSummary) => void;
  onDelete: (budgetId: string) => void;
}

const BudgetCard: React.FC<BudgetCardProps> = ({ budget, onEdit, onDelete }) => {
  const getProgressBarColor = () => {
    if (budget.isOverBudget) return 'bg-red-500';
    if (budget.percentageUsed >= 80) return 'bg-yellow-500';
    return 'bg-green-500';
  };

  const getProgressTextColor = () => {
    if (budget.isOverBudget) return 'text-red-600';
    if (budget.percentageUsed >= 80) return 'text-yellow-600';
    return 'text-green-600';
  };

  const formatPeriod = (period: BudgetPeriod) => {
    return period.charAt(0).toUpperCase() + period.slice(1);
  };

  return (
    <div className="bg-white rounded-lg shadow-md p-6 hover:shadow-lg transition-shadow">
      <div className="flex justify-between items-start mb-4">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">{budget.name}</h3>
          <span className="text-sm text-gray-500">{formatPeriod(budget.period)}</span>
        </div>
        <div className="flex space-x-2">
          <button
            onClick={() => onEdit(budget)}
            className="text-blue-600 hover:text-blue-800 text-sm font-medium"
          >
            Edit
          </button>
          <button
            onClick={() => onDelete(budget.id)}
            className="text-red-600 hover:text-red-800 text-sm font-medium"
          >
            Delete
          </button>
        </div>
      </div>

      {/* Budget amounts */}
      <div className="mb-4">
        <div className="flex justify-between text-sm text-gray-600 mb-1">
          <span>Spent: {formatMoneyDetailed(budget.spent)}</span>
          <span>Budget: {formatMoneyDetailed(budget.amount)}</span>
        </div>
        
        {/* Progress bar */}
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div
            className={`h-2 rounded-full transition-all duration-300 ${getProgressBarColor()}`}
            style={{ width: `${Math.min(budget.percentageUsed, 100)}%` }}
          ></div>
        </div>
        
        <div className="flex justify-between items-center mt-2">
          <span className={`text-sm font-medium ${getProgressTextColor()}`}>
            {formatPercentage(budget.percentageUsed)} used
          </span>
          <span className="text-sm text-gray-600">
            {budget.daysRemaining} days left
          </span>
        </div>
      </div>

      {/* Remaining amount */}
      <div className="flex justify-between items-center">
        <span className="text-sm text-gray-600">Remaining:</span>
        <span className={`font-semibold ${budget.remaining >= 0 ? 'text-green-600' : 'text-red-600'}`}>
          {formatMoneyDetailed(Math.abs(budget.remaining))}
          {budget.remaining < 0 && ' over budget'}
        </span>
      </div>

      {/* Alert badges */}
      <div className="mt-3 flex flex-wrap gap-2">
        {budget.isOverBudget && (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
            Over Budget
          </span>
        )}
        {!budget.isOverBudget && budget.percentageUsed >= 80 && (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
            Near Limit
          </span>
        )}
        {budget.daysRemaining <= 7 && (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
            Ending Soon
          </span>
        )}
      </div>
    </div>
  );
};

export default BudgetCard;