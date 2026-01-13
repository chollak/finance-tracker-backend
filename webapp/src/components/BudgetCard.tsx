import React from 'react';
import { BudgetSummary, BudgetPeriod } from '../types';
import { formatMoneyDetailed, formatPercentage } from '../utils/formatMoney';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';

interface BudgetCardProps {
  budget: BudgetSummary;
  onEdit: (budget: BudgetSummary) => void;
  onDelete: (budgetId: string) => void;
}

const BudgetCard: React.FC<BudgetCardProps> = ({ budget, onEdit, onDelete }) => {
  const getProgressVariant = () => {
    if (budget.isOverBudget) return 'destructive';
    if (budget.percentageUsed >= 80) return 'warning';
    return 'default';
  };

  const getProgressTextColor = () => {
    if (budget.isOverBudget) return 'text-red-expense';
    if (budget.percentageUsed >= 80) return 'text-orange-500';
    return 'text-green-income';
  };

  const formatPeriod = (period: BudgetPeriod) => {
    return period.charAt(0).toUpperCase() + period.slice(1);
  };

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardHeader>
        <div className="flex justify-between items-start">
          <div>
            <h3 className="text-lg font-semibold">{budget.name}</h3>
            <span className="text-sm text-muted-foreground">{formatPeriod(budget.period)}</span>
          </div>
          <div className="flex gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onEdit(budget)}
            >
              Edit
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onDelete(budget.id)}
              className="text-destructive hover:text-destructive"
            >
              Delete
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent>
        {/* Budget amounts */}
        <div className="mb-4">
          <div className="flex justify-between text-sm text-muted-foreground mb-2">
            <span>Spent: {formatMoneyDetailed(budget.spent)}</span>
            <span>Budget: {formatMoneyDetailed(budget.amount)}</span>
          </div>

          {/* Progress bar */}
          <Progress
            value={Math.min(budget.percentageUsed, 100)}
            className="h-2 mb-2"
          />

          <div className="flex justify-between items-center">
            <span className={`text-sm font-medium ${getProgressTextColor()}`}>
              {formatPercentage(budget.percentageUsed)} used
            </span>
            <span className="text-sm text-muted-foreground">
              {budget.daysRemaining} days left
            </span>
          </div>
        </div>

        {/* Remaining amount */}
        <div className="flex justify-between items-center mb-3">
          <span className="text-sm text-muted-foreground">Remaining:</span>
          <span className={`font-semibold ${budget.remaining >= 0 ? 'text-green-income' : 'text-red-expense'}`}>
            {formatMoneyDetailed(Math.abs(budget.remaining))}
            {budget.remaining < 0 && ' over budget'}
          </span>
        </div>

        {/* Alert badges */}
        <div className="flex flex-wrap gap-2">
          {budget.isOverBudget && (
            <Badge variant="destructive">
              Over Budget
            </Badge>
          )}
          {!budget.isOverBudget && budget.percentageUsed >= 80 && (
            <Badge variant="secondary" className="bg-orange-100 text-orange-700 hover:bg-orange-200">
              Near Limit
            </Badge>
          )}
          {budget.daysRemaining <= 7 && (
            <Badge variant="secondary">
              Ending Soon
            </Badge>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default BudgetCard;
