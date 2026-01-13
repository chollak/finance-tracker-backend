import React from 'react';
import { BudgetSummary, BudgetPeriod } from '../types';
import { formatMoneyDetailed, formatPercentage } from '../utils/formatMoney';
import { Card, Badge } from '../design-system/components';

interface BudgetCardProps {
  budget: BudgetSummary;
  onEdit: (budget: BudgetSummary) => void;
  onDelete: (budgetId: string) => void;
}

const BudgetCard: React.FC<BudgetCardProps> = ({ budget, onEdit, onDelete }) => {
  const getProgressBarColor = () => {
    if (budget.isOverBudget) return 'bg-red-expense';
    if (budget.percentageUsed >= 80) return 'bg-light-yellow';
    return 'bg-green-income';
  };

  const getProgressTextColor = () => {
    if (budget.isOverBudget) return 'text-red-expense';
    if (budget.percentageUsed >= 80) return 'text-light-yellow';
    return 'text-green-income';
  };

  const formatPeriod = (period: BudgetPeriod) => {
    return period.charAt(0).toUpperCase() + period.slice(1);
  };

  return (
    <Card variant="white" rounded="3xl" padding="lg" hover>
      <div className="flex justify-between items-start mb-4">
        <div>
          <h3 className="text-lg font-semibold text-card-dark">{budget.name}</h3>
          <span className="text-sm text-gray-500">{formatPeriod(budget.period)}</span>
        </div>
        <div className="flex space-x-2">
          <button
            onClick={() => onEdit(budget)}
            className="text-card-dark hover:opacity-70 text-sm font-medium transition-opacity"
          >
            Edit
          </button>
          <button
            onClick={() => onDelete(budget.id)}
            className="text-red-expense hover:opacity-70 text-sm font-medium transition-opacity"
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
        <span className={`font-semibold ${budget.remaining >= 0 ? 'text-green-income' : 'text-red-expense'}`}>
          {formatMoneyDetailed(Math.abs(budget.remaining))}
          {budget.remaining < 0 && ' over budget'}
        </span>
      </div>

      {/* Alert badges */}
      <div className="mt-3 flex flex-wrap gap-2">
        {budget.isOverBudget && (
          <Badge variant="error">
            Over Budget
          </Badge>
        )}
        {!budget.isOverBudget && budget.percentageUsed >= 80 && (
          <Badge variant="warning">
            Near Limit
          </Badge>
        )}
        {budget.daysRemaining <= 7 && (
          <Badge variant="info">
            Ending Soon
          </Badge>
        )}
      </div>
    </Card>
  );
};

export default BudgetCard;